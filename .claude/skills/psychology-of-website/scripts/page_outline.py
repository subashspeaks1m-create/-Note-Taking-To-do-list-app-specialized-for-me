#!/usr/bin/env python3
"""Outline a web page for a conversion audit.

Pulls the parts of a page that matter for the internal-monologue walkthrough:
title and meta description, headings in document order, CTA-like buttons and
links, social-proof signals, stat-like numbers, media counts, and quick flags.
Uses only the standard library.

Usage:
    python page_outline.py https://example.com
    python page_outline.py saved_page.html --json

Pages that render their content with JavaScript may come back nearly empty;
the output says so. In that case render the page in a browser first, or work
from screenshots or pasted copy.

This is an aid for the auditor, not a verdict: the flags point at places worth
looking at, and the monologue walkthrough decides what actually leaks.
"""

import argparse
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

SKIP_TAGS = {"script", "style", "noscript", "svg", "template"}
HEADING_TAGS = {"h1", "h2", "h3", "h4"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "source", "track", "wbr"}

CTA_WORDS = re.compile(
    r"\b(buy|shop|order|get|start|try|book|schedule|claim|join|subscribe|"
    r"sign ?up|register|add to (cart|bag)|checkout|request|download|demo|"
    r"quote|call|contact|apply|reserve|enrol|enroll|donate)\b",
    re.I,
)
CTA_CLASS = re.compile(r"(btn|button|cta)", re.I)

PROOF_PATTERNS = {
    "reviews/ratings": re.compile(
        r"\b(reviews?|rated|ratings?|stars?|testimonials?)\b|★|⭐|\b\d(\.\d)?\s*/\s*5\b", re.I),
    "customer counts": re.compile(
        r"\b(customers|clients|users|members|students|families|homeowners|"
        r"bottles sold|orders|happy)\b", re.I),
    "press/authority": re.compile(
        r"\b(featured in|as seen (in|on)|trusted by|recommended by|doctors?|"
        r"experts?|scientists?|certified|licensed|award|clinically)\b", re.I),
    "risk reversal": re.compile(
        r"\b(guarantee[d]?|money[- ]back|refund|free shipping|free trial|"
        r"no (credit card|contract|risk)|cancel anytime)\b", re.I),
}
STAT_PATTERN = re.compile(
    r"\b\d[\d,.]*\s*(\+|%|k\b|m\b|million|thousand|x\b)|\b\d{1,3}(,\d{3})+\b", re.I)


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


class OutlineParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.in_title = False
        self.title = ""
        self.meta_description = ""
        self.events = []          # document-order headings and CTAs
        self.text_chunks = []     # visible text, in order
        self.words_seen = 0
        self.images = 0
        self.images_no_alt = 0
        self.videos = 0
        self.forms = 0
        self.tel_links = 0
        self._capture = None      # (kind, tag, attrs, words_at_start, parts)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        if tag == "title":
            self.in_title = True
        if tag == "meta" and (attrs.get("name") or "").lower() == "description":
            self.meta_description = clean(attrs.get("content"))
        if tag == "meta" and (attrs.get("property") or "").lower() == "og:description" \
                and not self.meta_description:
            self.meta_description = clean(attrs.get("content"))
        if self.skip_depth:
            return
        if tag == "img":
            self.images += 1
            if not clean(attrs.get("alt")):
                self.images_no_alt += 1
        if tag == "video" or (tag == "iframe" and re.search(
                r"youtube|vimeo|wistia|loom", attrs.get("src") or "", re.I)):
            self.videos += 1
        if tag == "form":
            self.forms += 1
        if tag == "a" and (attrs.get("href") or "").startswith("tel:"):
            self.tel_links += 1
        if tag in VOID_TAGS:
            if tag == "input" and (attrs.get("type") or "").lower() in ("submit", "button"):
                self._add_cta(clean(attrs.get("value")), "input", attrs)
            return
        if self._capture is None and (tag in HEADING_TAGS or tag in ("a", "button")):
            self._capture = [tag, attrs, self.words_seen, []]

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if tag == "title":
            self.in_title = False
        if self._capture and self._capture[0] == tag:
            ctag, attrs, words_at, parts = self._capture
            self._capture = None
            text = clean(" ".join(parts)) or clean(attrs.get("aria-label"))
            if ctag in HEADING_TAGS:
                if text:
                    self.events.append({"type": ctag, "text": text, "word_pos": words_at})
            else:
                self._add_cta(text, ctag, attrs, words_at)

    def _add_cta(self, text, tag, attrs, words_at=None):
        if not text or len(text) > 60:
            return
        href = attrs.get("href") or ""
        looks_like_cta = (
            tag in ("button", "input")
            or href.startswith("tel:")
            or CTA_WORDS.search(text)
            or CTA_CLASS.search(attrs.get("class") or "")
        )
        if looks_like_cta:
            self.events.append({
                "type": "cta", "text": text, "href": href,
                "word_pos": self.words_seen if words_at is None else words_at,
            })

    def handle_data(self, data):
        if self.in_title:
            self.title += data
            return
        if self.skip_depth:
            return
        text = clean(data)
        if not text:
            return
        self.text_chunks.append(text)
        self.words_seen += len(text.split())
        if self._capture:
            self._capture[3].append(text)


def load(source, timeout):
    if re.match(r"^https?://", source, re.I):
        req = urllib.request.Request(source, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    return Path(source).read_text(encoding="utf-8", errors="replace")


def analyze(html):
    p = OutlineParser()
    p.feed(html)
    p.close()

    full_text = " ".join(p.text_chunks)
    headings = [e for e in p.events if e["type"] in HEADING_TAGS]
    ctas = [e for e in p.events if e["type"] == "cta"]

    proof = {}
    for label, pattern in PROOF_PATTERNS.items():
        hits = [c for c in p.text_chunks if pattern.search(c) and len(c) < 200]
        proof[label] = {"count": len(hits), "examples": list(dict.fromkeys(hits))[:5]}
    stats = list(dict.fromkeys(
        c for c in p.text_chunks if STAT_PATTERN.search(c) and len(c) < 120))[:12]

    cta_counts = {}
    for c in ctas:
        key = c["text"].lower()
        cta_counts[key] = cta_counts.get(key, 0) + 1

    flags = []
    if p.words_seen < 80:
        flags.append("Very little visible text: the page may render with JavaScript. "
                     "Render it in a browser or use screenshots/pasted copy.")
    h1s = [h for h in headings if h["type"] == "h1"]
    if not h1s:
        flags.append("No H1: the hero message may be an image or missing.")
    elif len(h1s) > 1:
        flags.append(f"{len(h1s)} H1s: is there one clear hero message?")
    elif len(h1s[0]["text"].split()) > 14:
        flags.append("Hero H1 is long (>14 words): can it land in one glance on a phone?")
    if not ctas:
        flags.append("No CTA-like buttons or links found.")
    elif ctas[0]["word_pos"] > 150:
        flags.append("First CTA appears after ~150+ words: the hero may lack a CTA.")
    if len(cta_counts) > 6:
        flags.append(f"{len(cta_counts)} distinct CTA labels: competing actions? "
                     "Look for one primary CTA.")
    total_proof = sum(v["count"] for v in proof.values())
    if total_proof < 3:
        flags.append("Few social-proof signals: reviews, numbers, press, guarantees?")
    if proof["risk reversal"]["count"] == 0:
        flags.append("No risk reversal found (guarantee, free trial, refund).")
    if p.videos == 0:
        flags.append("No video found: consider video testimonials.")
    if not p.meta_description:
        flags.append("No meta description.")
    if p.images and p.images_no_alt / p.images > 0.5:
        flags.append(f"{p.images_no_alt}/{p.images} images lack alt text.")

    return {
        "title": clean(p.title),
        "meta_description": p.meta_description,
        "word_count": p.words_seen,
        "outline": [{k: v for k, v in e.items() if k != "word_pos"} | {"at_word": e["word_pos"]}
                    for e in p.events],
        "cta_labels": cta_counts,
        "proof_signals": proof,
        "stat_lines": stats,
        "media": {"images": p.images, "images_without_alt": p.images_no_alt,
                  "videos": p.videos, "forms": p.forms, "tel_links": p.tel_links},
        "flags": flags,
        "first_words": " ".join(full_text.split()[:60]),
    }


def print_report(r, source):
    print(f"# Page outline: {source}\n")
    print(f"Title: {r['title'] or '(none)'}")
    print(f"Meta description: {r['meta_description'] or '(none)'}")
    print(f"Visible words: {r['word_count']}\n")
    print(f"Opening text: {r['first_words']}\n")
    print("## Outline (document order)")
    for e in r["outline"]:
        if e["type"] == "cta":
            print(f"    [CTA] {e['text']}" + (f"  -> {e['href']}" if e.get("href") else ""))
        else:
            indent = "  " * (int(e["type"][1]) - 1)
            print(f"{indent}{e['type'].upper()}: {e['text']}")
    print("\n## CTA labels (count)")
    for label, n in sorted(r["cta_labels"].items(), key=lambda x: -x[1]):
        print(f"  {n}x {label}")
    print("\n## Proof signals")
    for label, v in r["proof_signals"].items():
        print(f"  {label}: {v['count']}")
        for ex in v["examples"]:
            print(f"     - {ex}")
    if r["stat_lines"]:
        print("\n## Stat-like lines")
        for s in r["stat_lines"]:
            print(f"  - {s}")
    m = r["media"]
    print(f"\n## Media\n  images {m['images']} (no alt: {m['images_without_alt']}), "
          f"videos {m['videos']}, forms {m['forms']}, tel links {m['tel_links']}")
    print("\n## Flags (check these during the walkthrough)")
    for f in r["flags"] or ["None"]:
        print(f"  - {f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="URL (http/https) or path to a saved HTML file")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--timeout", type=float, default=20, help="fetch timeout in seconds")
    args = ap.parse_args()
    try:
        html = load(args.source, args.timeout)
    except Exception as exc:  # network errors, missing file, etc.
        print(f"Could not load {args.source}: {exc}", file=sys.stderr)
        print("Try saving the page as HTML, rendering it in a browser, or pasting the copy.",
              file=sys.stderr)
        sys.exit(1)
    report = analyze(html)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_report(report, args.source)


if __name__ == "__main__":
    main()
