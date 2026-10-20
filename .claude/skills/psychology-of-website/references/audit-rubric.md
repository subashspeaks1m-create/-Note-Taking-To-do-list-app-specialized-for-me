# Conversion Audit Rubric

Use this to audit an existing website or to grade your own draft before handoff. Start with the monologue walkthrough. The score comes second, because it summarizes what the walkthrough found.

## Step 1: Gather the page

- Run `python scripts/page_outline.py <url-or-html-file>` (add `--json` for machine-readable output). It lists the title, meta description, heading order, CTA-like buttons and links, proof signals, numbers, images, and quick flags.
- If the output is nearly empty, the site probably renders with JavaScript. Use a headless browser if one is available, or ask for screenshots or pasted copy.
- Note the traffic source if you know it (an ad, search, social), since it changes what the hero needs to say.

## Step 2: Monologue walkthrough

Pick the ICP (see `icp-research.md`). Scroll section by section and write the inner voice in italics, first person, honestly, including the doubts. For each section, record:
- what the visitor is thinking on arrival,
- whether the section answers that thought,
- the new doubt it leaves behind.

The places where the voice says *"so what?"*, *"says who?"*, *"too expensive"*, *"is this for me?"*, or *"where do I click?"* are your conversion leaks.

## Step 3: Score (0–2 each, 20 max)

| # | Criterion | 0 | 1 | 2 |
|---|---|---|---|---|
| 1 | **Hero clarity:** a stranger knows what it is, who it's for, and why it matters in 5 seconds | Vague or company-centric | Partly clear | Instantly clear and ICP-specific |
| 2 | **ICP focus:** written to one specific person | "For everyone" | Mixed audiences | One clear ICP throughout |
| 3 | **Narrative angle:** one story or enemy carried through | None | Present but inconsistent | Consistent in every headline |
| 4 | **Problem in buyer language** | Absent | Generic | Their words; makes the ICP nod |
| 5 | **Solution and mechanism:** how it helps, plainly | Missing | Feature-led | Outcome-led with a believable mechanism |
| 6 | **Proof quantity and variety** | None | One type, once | 3+ placements, 2+ formats |
| 7 | **Proof credibility:** specific, real, relatable | Generic or suspicious | Real but vague | Specific results from ICP-like people |
| 8 | **Price justification and why us** | Price with no defense | Partial | Price objection answered before it arises |
| 9 | **CTA:** one primary action, specific wording, repeated, with risk reversal | Missing or confusing | Present but weak or competing | Clear, repeated, with risk reversal |
| 10 | **Mobile and speed:** readable, fast, CTA reachable | Broken or slow | Acceptable | Fast and thumb-friendly |

**Reading the score:** 0–8 means it's a website that exists, not one that sells. 9–14 means the foundations are there but there are clear leaks. 15–18 means it's strong, so optimize the details. 19–20 means it's excellent, so test the variants.

## Step 4: Prioritize the fixes

Rank the gaps by impact:
1. Hero clarity and ICP focus (if visitors don't think "this is for me", nothing else gets read)
2. Missing proof
3. Unanswered price objection
4. Weak, competing, or missing CTA
5. Missing problem/solution narrative
6. Everything else (visual polish, ordering, micro-copy)

## Report template

```markdown
# Conversion Audit: [Site] ([URL])

**ICP assumed:** [one sentence]   **Traffic source:** [if known]
**Score:** [X]/20. [one-line verdict]

## The visitor's scroll (monologue walkthrough)
1. **[Section name]**: *"[inner voice]"* → [answered / leak: ...]
2. ...

## Top fixes (by impact)
1. **[Fix]**: why it matters, and what to change. Before: "..." → After: "..."
2. ...

## Scorecard
| Criterion | Score | Note |
|---|---|---|

## Proposed section map
[New order, with the question each section answers]

## Copy deck
[See assets/copy-deck-template.md, or a link to it]

## Needs from the client
[Real reviews, numbers, guarantee terms, photos, etc.]
```
