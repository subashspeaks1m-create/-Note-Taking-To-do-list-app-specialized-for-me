import type { jsPDF } from 'jspdf';
import { parseCoach } from '../coach/coachPrompt';
import type { Kpi, PdfReportData } from './pdfModel';

/**
 * Draws the report as an A4 PDF: a cover page of headline numbers and
 * charts, then goals, money, habits and the written record. The PDF library
 * is loaded only when someone asks for a PDF.
 */

type RGB = [number, number, number];
const INK: RGB = [29, 36, 51];
const MUTED: RGB = [107, 114, 128];
const LINE: RGB = [226, 229, 236];
const GOLD: RGB = [200, 137, 29];
const TEAL: RGB = [42, 127, 143];
const UP: RGB = [22, 128, 76];
const DOWN: RGB = [190, 52, 52];
const PANEL: RGB = [246, 247, 250];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 18;

/** The built-in PDF fonts only cover Western characters; swap the common ones and drop the rest. */
export function pdfText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/→/g, '->')
    .replace(/₹/g, 'Rs ')
    .replace(/€/g, 'EUR ')
    .replace(/\t/g, ' ')
    .replace(/[^\n\r\x20-\x7e\xa0-\xff]/g, '');
}

class Doc {
  y = M;
  constructor(
    private pdf: jsPDF,
    private footer: string,
  ) {}

  color(c: RGB) {
    this.pdf.setTextColor(c[0], c[1], c[2]);
  }
  fill(c: RGB) {
    this.pdf.setFillColor(c[0], c[1], c[2]);
  }
  stroke(c: RGB) {
    this.pdf.setDrawColor(c[0], c[1], c[2]);
  }
  font(size: number, style: 'normal' | 'bold' = 'normal', c: RGB = INK) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
    this.color(c);
  }

  newPage() {
    this.pdf.addPage();
    this.y = M;
  }
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage();
  }

  text(s: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' }) {
    this.pdf.text(pdfText(s), x, y, opts);
  }

  lines(s: string, width: number): string[] {
    return this.pdf.splitTextToSize(pdfText(s), width) as string[];
  }

  heading(s: string, sub?: string) {
    this.ensure(sub ? 22 : 16);
    this.y += 4;
    this.fill(GOLD);
    this.pdf.rect(M, this.y - 4.2, 1.6, 5.4, 'F');
    this.font(13, 'bold');
    this.text(s, M + 4, this.y);
    this.y += 5;
    if (sub) {
      this.font(9, 'normal', MUTED);
      this.text(sub, M + 4, this.y);
      this.y += 5;
    }
    this.y += 2;
  }

  para(s: string, opts: { size?: number; color?: RGB; indent?: number; bullet?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = size * 0.45;
    this.font(size, 'normal', opts.color ?? INK);
    const body = this.lines(s, CONTENT_W - indent - (opts.bullet ? 4 : 0));
    for (let i = 0; i < body.length; i++) {
      this.ensure(lh + 1);
      this.font(size, 'normal', opts.color ?? INK);
      if (opts.bullet && i === 0) {
        this.fill(GOLD);
        this.pdf.circle(M + indent + 1.2, this.y - lh * 0.35, 0.7, 'F');
      }
      this.pdf.text(body[i]!, M + indent + (opts.bullet ? 4 : 0), this.y);
      this.y += lh;
    }
    this.y += opts.gap ?? 1.5;
  }

  /** A titled block of text, or a quiet line when it is empty. */
  quote(label: string, s: string, empty: string) {
    this.ensure(14);
    this.font(9, 'bold', MUTED);
    this.text(label.toUpperCase(), M, this.y);
    this.y += 5;
    if (s.trim()) this.para(s.trim(), { gap: 4 });
    else this.para(empty, { color: MUTED, gap: 4 });
  }

  kpis(items: Kpi[]) {
    const cols = 3;
    const gap = 4;
    const w = (CONTENT_W - gap * (cols - 1)) / cols;
    const h = 24;
    this.ensure(h * 2 + gap);
    items.forEach((k, i) => {
      const x = M + (i % cols) * (w + gap);
      const y = this.y + Math.floor(i / cols) * (h + gap);
      this.fill(PANEL);
      this.pdf.roundedRect(x, y, w, h, 2, 2, 'F');
      this.font(8, 'bold', MUTED);
      this.text(k.label.toUpperCase(), x + 4, y + 6);
      this.font(16, 'bold');
      this.text(k.value, x + 4, y + 14);
      const c = k.trend === 'up' ? UP : k.trend === 'down' ? DOWN : MUTED;
      this.font(8, 'normal', c);
      const line = this.lines(k.change, w - 8)[0] ?? '';
      this.pdf.text(line, x + 4, y + 20);
    });
    this.y += Math.ceil(items.length / cols) * (h + gap) + 2;
  }

  /** Axis frame with a few horizontal guides; returns a y mapper. */
  private frame(x: number, y: number, w: number, h: number, max: number) {
    const top = max <= 0 ? 1 : max;
    this.stroke(LINE);
    this.pdf.setLineWidth(0.2);
    this.font(7, 'normal', MUTED);
    for (let i = 0; i <= 4; i++) {
      const gy = y + h - (h * i) / 4;
      this.pdf.line(x, gy, x + w, gy);
      this.text(String(Math.round((top * i) / 4)), x - 2, gy + 1, { align: 'right' });
    }
    return (v: number) => y + h - (Math.max(0, v) / top) * h;
  }

  barChart(values: number[], labels: string[], color: RGB, height = 46) {
    this.ensure(height + 12);
    const x = M + 8;
    const w = CONTENT_W - 8;
    const y = this.y;
    const max = Math.max(1, ...values);
    const toY = this.frame(x, y, w, height, niceMax(max));
    const slot = w / values.length;
    const bw = Math.max(1, slot * 0.66);
    this.fill(color);
    values.forEach((v, i) => {
      if (v <= 0) return;
      const top = toY(v);
      this.pdf.rect(x + i * slot + (slot - bw) / 2, top, bw, y + height - top, 'F');
    });
    this.font(6.5, 'normal', MUTED);
    const every = values.length > 14 ? 3 : 1;
    labels.forEach((l, i) => {
      if (i % every === 0 || i === labels.length - 1) this.text(l, x + i * slot + slot / 2, y + height + 4, { align: 'center' });
    });
    this.y += height + 9;
  }

  lineChart(series: { values: (number | null)[]; color: RGB; label: string; dashed?: boolean }[], labels: string[], height = 50) {
    this.ensure(height + 18);
    const x = M + 8;
    const w = CONTENT_W - 8;
    const y = this.y;
    const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
    const toY = this.frame(x, y, w, height, niceMax(max));
    const n = Math.max(...series.map((s) => s.values.length), 2);
    const toX = (i: number) => x + (w * i) / (n - 1);
    for (const s of series) {
      this.stroke(s.color);
      this.pdf.setLineWidth(s.dashed ? 0.4 : 0.8);
      this.pdf.setLineDashPattern(s.dashed ? [1.2, 1] : [], 0);
      let prev: [number, number] | null = null;
      s.values.forEach((v, i) => {
        if (v === null) {
          prev = null;
          return;
        }
        const pt: [number, number] = [toX(i), toY(v)];
        if (prev) this.pdf.line(prev[0], prev[1], pt[0], pt[1]);
        prev = pt;
      });
    }
    this.pdf.setLineDashPattern([], 0);
    this.font(6.5, 'normal', MUTED);
    const every = labels.length > 14 ? 3 : 1;
    labels.forEach((l, i) => {
      if (i % every === 0 || i === labels.length - 1) this.text(l, toX(i), y + height + 4, { align: 'center' });
    });
    // Legend.
    let lx = x;
    const ly = y + height + 10;
    for (const s of series) {
      this.stroke(s.color);
      this.pdf.setLineWidth(s.dashed ? 0.4 : 0.8);
      this.pdf.setLineDashPattern(s.dashed ? [1.2, 1] : [], 0);
      this.pdf.line(lx, ly - 1, lx + 6, ly - 1);
      this.pdf.setLineDashPattern([], 0);
      this.font(8, 'normal', MUTED);
      this.text(s.label, lx + 8, ly);
      lx += 12 + this.pdf.getTextWidth(pdfText(s.label));
    }
    this.y += height + 15;
  }

  /** Two horizontal bars that share one scale. */
  split(items: { label: string; value: number; color: RGB }[]) {
    const total = items.reduce((n, i) => n + i.value, 0);
    this.ensure(items.length * 8 + 4);
    const labelW = 30;
    const w = CONTENT_W - labelW - 24;
    for (const it of items) {
      this.font(9, 'normal');
      this.text(it.label, M, this.y + 3.2);
      this.fill(PANEL);
      this.pdf.rect(M + labelW, this.y, w, 4.5, 'F');
      if (total) {
        this.fill(it.color);
        this.pdf.rect(M + labelW, this.y, (w * it.value) / total, 4.5, 'F');
      }
      this.font(9, 'bold');
      this.text(`${it.value}${total ? ` (${Math.round((it.value / total) * 100)}%)` : ''}`, M + labelW + w + 3, this.y + 3.4);
      this.y += 8;
    }
    this.y += 2;
  }

  table(cols: { label: string; width: number; align?: 'left' | 'right' }[], rows: string[][]) {
    const pad = 2;
    const header = () => {
      this.ensure(14);
      this.fill(PANEL);
      this.pdf.rect(M, this.y, CONTENT_W, 7, 'F');
      this.font(8, 'bold', MUTED);
      let x = M;
      for (const c of cols) {
        const w = c.width * CONTENT_W;
        this.text(c.label.toUpperCase(), c.align === 'right' ? x + w - pad : x + pad, this.y + 4.8, { align: c.align ?? 'left' });
        x += w;
      }
      this.y += 7;
    };
    header();
    for (const row of rows) {
      this.font(9, 'bold');
      const cells = row.map((cell, i) => this.lines(cell, cols[i]!.width * CONTENT_W - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * 4 + 3;
      if (this.y + h > BOTTOM) {
        this.newPage();
        header();
      }
      let x = M;
      cells.forEach((c, i) => {
        const col = cols[i]!;
        const w = col.width * CONTENT_W;
        this.font(9, i === 0 ? 'bold' : 'normal');
        c.forEach((line, j) => this.pdf.text(line, col.align === 'right' ? x + w - pad : x + pad, this.y + 4.5 + j * 4, { align: col.align ?? 'left' }));
        x += w;
      });
      this.y += h;
      this.stroke(LINE);
      this.pdf.setLineWidth(0.2);
      this.pdf.line(M, this.y, M + CONTENT_W, this.y);
    }
    this.y += 4;
  }

  list(items: string[], empty: string, limit = 60) {
    if (!items.length) {
      this.para(empty, { color: MUTED });
      return;
    }
    for (const it of items.slice(0, limit)) this.para(it, { bullet: true, gap: 0.6, size: 9.5 });
    if (items.length > limit) this.para(`...and ${items.length - limit} more.`, { color: MUTED });
    this.y += 2;
  }

  stamp() {
    const pages = this.pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      this.pdf.setPage(i);
      this.stroke(LINE);
      this.pdf.setLineWidth(0.2);
      this.pdf.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
      this.font(7.5, 'normal', MUTED);
      this.text(this.footer, M, PAGE_H - 8);
      this.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    }
  }
}

/** Rounds a chart's top up to a tidy number. */
export function niceMax(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * mag >= n) return step * mag;
  return 10 * mag;
}

export async function renderReportPdf(d: PdfReportData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `${d.title} - ${d.periodLabel}`, author: d.name, creator: 'Pursuit of Greatness' });
  const doc = new Doc(pdf, `Pursuit of Greatness  -  ${d.title}  -  ${d.periodLabel}`);
  const label = d.kind === 'month' ? 'month' : 'week';

  // Cover band.
  doc.fill(INK);
  pdf.rect(0, 0, PAGE_W, 44, 'F');
  doc.fill(GOLD);
  pdf.rect(0, 44, PAGE_W, 1.4, 'F');
  doc.font(9, 'bold', GOLD);
  doc.text('PURSUIT OF GREATNESS', M, 14);
  doc.font(22, 'bold', [255, 255, 255]);
  doc.text(d.periodLabel, M, 26);
  doc.font(11, 'normal', [210, 214, 222]);
  doc.text(`${d.title}${d.name ? ` for ${d.name}` : ''}`, M, 34);
  doc.font(8.5, 'normal', [170, 176, 190]);
  doc.text(`Made ${d.generatedOn} from your own records`, PAGE_W - M, 34, { align: 'right' });
  doc.y = 56;

  doc.heading('Headline numbers', `Compared with ${d.prevLabel}`);
  doc.kpis(d.kpis);

  doc.heading('Executive summary');
  for (const s of d.summary) doc.para(s, { bullet: true, gap: 1.2 });
  doc.y += 2;

  doc.heading('Growth curve', `Points added up day by day, this ${label} against ${d.prevLabel}`);
  doc.lineChart(
    [
      { values: d.growth, color: GOLD, label: `This ${label}` },
      { values: d.prevGrowth, color: TEAL, label: d.prevLabel, dashed: true },
    ],
    d.dayLabels,
  );

  doc.heading('Daily output', 'Points earned each day');
  doc.barChart(d.pointsPerDay, d.dayLabels, GOLD);

  doc.heading('Where the work went', 'Finished tasks by track');
  doc.split([
    { label: 'Learning', value: d.learning, color: TEAL },
    { label: 'Doing', value: d.doing, color: GOLD },
  ]);

  // Money, like a company's revenue page.
  const e = d.earnings;
  doc.heading('Money earned', `Logged earnings this ${label}, the way a company reads revenue`);
  doc.table(
    [
      { label: 'Measure', width: 0.6 },
      { label: 'Value', width: 0.4, align: 'right' },
    ],
    [
      [`This ${label}`, `$${e.total.toLocaleString('en-US')}`],
      [d.prevLabel === 'last week' ? 'Last week' : d.prevLabel, `$${e.prevTotal.toLocaleString('en-US')}`],
      ['Growth', e.prevTotal ? `${e.total >= e.prevTotal ? '+' : ''}${Math.round(((e.total - e.prevTotal) / e.prevTotal) * 100)}%` : e.total ? 'new' : '-'],
      ['Earnings logged', String(e.entries)],
      ['Biggest single amount', e.biggest ? `$${e.biggest.amount.toLocaleString('en-US')} on ${e.biggest.date}` : '-'],
      ['Per active day', e.perActiveDay === null ? '-' : `$${e.perActiveDay.toLocaleString('en-US')}`],
      ['Total logged to date', `$${e.allTime.toLocaleString('en-US')}`],
    ],
  );
  if (e.total > 0) {
    doc.heading('Running total', `Money earned added up through the ${label}`);
    doc.lineChart([{ values: e.running, color: UP, label: 'Earned so far' }], d.dayLabels, 40);
  }

  const c = d.content;
  if (c.posts || c.prevPosts || c.audienceEnd !== null) {
    doc.heading('Content and audience');
    doc.table(
      [
        { label: 'Measure', width: 0.6 },
        { label: 'Value', width: 0.4, align: 'right' },
      ],
      [
        [`Posts this ${label}`, String(c.posts)],
        [`Posts in ${d.prevLabel}`, String(c.prevPosts)],
        ['Audience at start', c.audienceStart === null ? '-' : c.audienceStart.toLocaleString('en-US')],
        ['Audience at end', c.audienceEnd === null ? '-' : c.audienceEnd.toLocaleString('en-US')],
        ['Audience growth', c.audienceStart !== null && c.audienceEnd !== null ? `${c.audienceEnd - c.audienceStart >= 0 ? '+' : ''}${(c.audienceEnd - c.audienceStart).toLocaleString('en-US')}` : '-'],
      ],
    );
  }

  doc.heading('Goals', `Where each goal stood at the start and end of the ${label}`);
  if (d.goals.length) {
    doc.table(
      [
        { label: 'Goal', width: 0.3 },
        { label: 'Start', width: 0.13, align: 'right' },
        { label: 'End', width: 0.13, align: 'right' },
        { label: 'Change', width: 0.13, align: 'right' },
        { label: 'Pace', width: 0.31 },
      ],
      d.goals.map((g) => [`${g.title}\n${g.plan}`, g.start, g.end, g.change, g.pace]),
    );
  } else doc.para('No active goals yet. Add goals on Visions to see them here.', { color: MUTED });

  doc.heading('Habits and follow-through');
  doc.table(
    [
      { label: 'Measure', width: 0.6 },
      { label: 'Count', width: 0.4, align: 'right' },
    ],
    [
      ['Missed habit days', String(d.habits.missed)],
      ['Tasks carried over to another day', String(d.habits.carriedOver)],
      ['Planned tasks still open', String(d.habits.stillOpen)],
    ],
  );

  doc.heading('What happened', `Your own record of the ${label}`);
  doc.quote('Focus you set', d.focus, `No focus was set for this ${label}.`);
  doc.quote('Your review', d.review, 'No review written yet.');
  doc.quote('What got in the way', d.blockers, 'Nothing written.');
  doc.quote(`Next ${label}'s focus`, d.nextFocus, 'Not set yet.');

  doc.heading('Completed tasks', `${d.completedTasks.length} finished`);
  doc.list(d.completedTasks, 'No tasks finished in this period.');
  doc.heading('What you learned');
  doc.list(d.learned, 'No learning entries.');
  doc.heading('What you did');
  doc.list(d.did, 'No doing entries.');

  if (d.coachText?.trim()) {
    doc.heading("Coach's analysis", 'Written by the AI coach from your record');
    for (const b of parseCoach(d.coachText)) {
      if (b.type === 'heading') {
        doc.ensure(10);
        doc.font(10.5, 'bold');
        doc.y += 1.5;
        doc.text(b.text, M, doc.y);
        doc.y += 5;
      } else if (b.type === 'item') doc.para(b.n ? `${b.n}. ${b.text}` : b.text, { bullet: !b.n, indent: b.n ? 2 : 0, gap: 1 });
      else doc.para(b.text, { gap: 2 });
    }
  } else {
    doc.heading("Coach's analysis");
    doc.para(`No coach notes for this ${label} yet. Ask the coach on the report page, then save the PDF again to include its analysis.`, { color: MUTED });
  }

  doc.stamp();
  return pdf.output('blob');
}
