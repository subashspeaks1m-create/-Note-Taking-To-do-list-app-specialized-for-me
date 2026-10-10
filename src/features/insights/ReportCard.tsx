import { forwardRef } from 'react';
import { addDays, dayOfWeek, formatKey, formatMedium, formatShort, type DateKey, type WeekStart } from '../../date/localDate';
import { LEVEL_NAME, type IntensityLevel } from '../../domain/intensity';
import type { Report } from './reportModel';

/**
 * The weekly/monthly report as one self-contained SVG, so the same drawing
 * shows in the app and exports to PNG. Colors and fonts are literal values
 * (no CSS variables) because exported SVGs can't see the page's stylesheet.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const C = {
  bg: '#0b1118',
  panel: '#121b26',
  line: '#26334a',
  text: '#f4f1e8',
  muted: '#b6c3d1',
  faint: '#7f8ea0',
  gold: '#e8c477',
  learning: '#79deec',
  doing: '#ffa38e',
  good: '#8ee0a4',
  bad: '#ff8a7a',
  level: ['#1a2533', '#c98a2e', '#ff6a3d', '#6fd6ff'] as const,
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

interface Props {
  report: Report;
  name: string;
  weekStart: WeekStart;
  goalsBehind: string[];
  nextFocus: string;
  generatedOn: DateKey;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function rangeLabel(r: Report): string {
  if (r.kind === 'month') return formatKey(r.range.start, { month: 'long', year: 'numeric' });
  return `${formatShort(r.range.start)} – ${formatShort(r.range.end)}, ${r.range.end.slice(0, 4)}`;
}

function Kpi({ x, label, value, sub, subTone }: { x: number; label: string; value: string; sub: string; subTone?: 'good' | 'bad' | 'muted' }) {
  return (
    <g transform={`translate(${x} 200)`}>
      <rect width={225} height={170} rx={20} fill={C.panel} stroke={C.line} />
      <text x={22} y={42} fill={C.muted} fontSize={20} fontWeight={600}>
        {label}
      </text>
      <text x={22} y={110} fill={C.text} fontSize={56} fontWeight={750}>
        {value}
      </text>
      <text x={22} y={146} fill={subTone === 'good' ? C.good : subTone === 'bad' ? C.bad : C.faint} fontSize={19}>
        {sub}
      </text>
    </g>
  );
}

function Growth({ report }: { report: Report }) {
  const x0 = 60;
  const y0 = 430;
  const w = 470;
  const h = 330;
  const pad = { l: 24, r: 24, t: 110, b: 44 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const all = [...report.growth.filter((v): v is number => v !== null), ...report.prevGrowth, 1];
  const max = Math.max(...all);
  const n = report.growth.length;
  const pn = report.prevGrowth.length;
  const px = (i: number, len: number) => pad.l + (len <= 1 ? 0 : (i / (len - 1)) * pw);
  const py = (v: number) => pad.t + ph - (v / max) * ph;
  const cur = report.growth
    .map((v, i) => (v === null ? null : `${px(i, n).toFixed(1)},${py(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const prev = report.prevGrowth.map((v, i) => `${px(i, pn).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const lastIdx = report.growth.reduce<number>((acc, v, i) => (v === null ? acc : i), -1);
  const now = lastIdx >= 0 ? report.growth[lastIdx]! : 0;
  const before = report.prevGrowth[Math.min(lastIdx, pn - 1)] ?? 0;
  return (
    <g transform={`translate(${x0} ${y0})`}>
      <rect width={w} height={h} rx={20} fill={C.panel} stroke={C.line} />
      <text x={24} y={40} fill={C.text} fontSize={24} fontWeight={700}>
        Growth
      </text>
      <text x={w - 24} y={40} fill={now >= before ? C.good : C.bad} fontSize={19} textAnchor="end">
        {signed(now - before)} pts vs same point last {report.kind}
      </text>
      <line x1={pad.l} x2={w - pad.r} y1={pad.t + ph} y2={pad.t + ph} stroke={C.line} />
      {prev && <polyline points={prev} fill="none" stroke={C.faint} strokeWidth={3} strokeDasharray="8 8" />}
      {cur && <polyline points={cur} fill="none" stroke={C.gold} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />}
      {lastIdx >= 0 && <circle cx={px(lastIdx, n)} cy={py(now)} r={8} fill={C.gold} />}
      <text x={pad.l} y={h - 14} fill={C.faint} fontSize={17}>
        {formatShort(report.range.start)}
      </text>
      <text x={w - pad.r} y={h - 14} fill={C.faint} fontSize={17} textAnchor="end">
        {formatShort(report.range.end)}
      </text>
      <g transform={`translate(${pad.l} 80)`}>
        <line x1={0} x2={26} y1={-6} y2={-6} stroke={C.gold} strokeWidth={5} strokeLinecap="round" />
        <text x={34} y={0} fill={C.muted} fontSize={16}>
          This {report.kind}
        </text>
        <line x1={150} x2={176} y1={-6} y2={-6} stroke={C.faint} strokeWidth={3} strokeDasharray="6 5" />
        <text x={184} y={0} fill={C.muted} fontSize={16}>
          Last {report.kind}
        </text>
      </g>
    </g>
  );
}

function Heatmap({ report, weekStart }: { report: Report; weekStart: WeekStart }) {
  const x0 = 550;
  const y0 = 430;
  const w = 470;
  const h = 330;
  const days = report.stats.totalDays;
  const first = report.range.start;
  const offset = report.kind === 'month' ? (dayOfWeek(first) - (weekStart === 'monday' ? 1 : 0) + 7) % 7 : 0;
  const cols = 7;
  const rows = Math.ceil((days + offset) / cols);
  const gap = 8;
  const size = Math.min((w - 48 - gap * (cols - 1)) / cols, (h - 92 - 48 - gap * (rows - 1)) / rows);
  // A single week gets tall cells so the row fills the panel.
  const cellH = rows === 1 ? h - 150 : size;
  const gridW = cols * size + (cols - 1) * gap;
  const left = (w - gridW) / 2;
  const names = Array.from({ length: 7 }, (_, i) => formatKey(addDays('2026-10-05', (weekStart === 'monday' ? 0 : -1) + i), { weekday: 'narrow' }));
  return (
    <g transform={`translate(${x0} ${y0})`}>
      <rect width={w} height={h} rx={20} fill={C.panel} stroke={C.line} />
      <text x={24} y={40} fill={C.text} fontSize={24} fontWeight={700}>
        Daily activity
      </text>
      <text x={w - 24} y={40} fill={C.muted} fontSize={19} textAnchor="end">
        {report.stats.activeDays} of {report.stats.elapsedDays || days} days active
      </text>
      {names.map((nm, i) => (
        <text key={i} x={left + i * (size + gap) + size / 2} y={78} fill={C.faint} fontSize={15} textAnchor="middle">
          {nm}
        </text>
      ))}
      {Array.from({ length: days }, (_, i) => {
        const d = addDays(first, i);
        const slot = i + offset;
        const cx = left + (slot % cols) * (size + gap);
        const cy = 92 + Math.floor(slot / cols) * (cellH + gap);
        const a = report.stats.perDay.get(d);
        const lv: IntensityLevel = a?.level ?? 0;
        const future = i >= report.stats.elapsedDays;
        return (
          <g key={d} transform={`translate(${cx} ${cy})`}>
            <rect width={size} height={cellH} rx={Math.min(10, size / 4)} fill={future ? 'none' : C.level[lv]} stroke={future ? C.line : lv === 3 ? '#bdeeff' : 'none'} strokeDasharray={future ? '4 4' : undefined} />
            <text x={size / 2} y={rows === 1 ? 30 : size / 2 + 6} fill={lv >= 1 ? '#0b1118' : future ? C.faint : C.muted} fontSize={Math.max(12, Math.min(18, size / 2.6))} fontWeight={650} textAnchor="middle">
              {Number(d.slice(8))}
            </text>
            {rows === 1 && !future && (
              <text x={size / 2} y={cellH - 14} fill={lv >= 1 ? '#0b1118' : C.faint} fontSize={15} fontWeight={700} textAnchor="middle">
                {a ? a.points : 0}
              </text>
            )}
          </g>
        );
      })}
      <g transform={`translate(24 ${h - 22})`}>
        {([1, 2, 3] as const).map((lv, i) => (
          <g key={lv} transform={`translate(${i * 140} 0)`}>
            <rect y={-14} width={18} height={18} rx={5} fill={C.level[lv]} />
            <text x={26} y={0} fill={C.muted} fontSize={16}>
              {LEVEL_NAME[lv]}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

function Mistakes({ report, goalsBehind }: { report: Report; goalsBehind: string[] }) {
  const s = report.stats;
  const habitCounts = new Map<string, number>();
  for (const m of s.missedHabits) habitCounts.set(m.title, (habitCounts.get(m.title) ?? 0) + 1);
  const habitList = [...habitCounts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, c]) => `${clip(t, 22)} ×${c}`).join(', ');
  const lines: string[] = [];
  if (s.missedHabits.length) lines.push(`Missed habits: ${s.missedHabits.length}${habitList ? ` (${habitList})` : ''}`);
  if (s.carriedOver) lines.push(`Carried over: ${s.carriedOver} task${s.carriedOver === 1 ? '' : 's'} pushed to a later day`);
  if (s.stillOpen) lines.push(`Still open: ${s.stillOpen} task${s.stillOpen === 1 ? '' : 's'} from past days`);
  if (goalsBehind.length) lines.push(`Behind pace: ${clip(goalsBehind.slice(0, 2).join(', '), 52)}${goalsBehind.length > 2 ? ` +${goalsBehind.length - 2}` : ''}`);
  if (report.streakBreaks) lines.push(`Streak broke ${report.streakBreaks} time${report.streakBreaks === 1 ? '' : 's'}`);
  if (s.scheduled && s.completionRate !== null && s.completionRate < 0.5) lines.push(`Finished ${Math.round(s.completionRate * 100)}% of what you planned`);
  const shown = lines.slice(0, 5);
  return (
    <g transform="translate(60 920)">
      <rect width={960} height={250} rx={20} fill={C.panel} stroke={C.line} />
      <text x={24} y={44} fill={C.text} fontSize={24} fontWeight={700}>
        Mistakes to fix
      </text>
      {shown.length === 0 ? (
        <text x={24} y={100} fill={C.good} fontSize={22}>
          {s.elapsedDays === 0 ? 'Nothing recorded yet.' : `No misses recorded this ${report.kind}. Clean run.`}
        </text>
      ) : (
        shown.map((l, i) => (
          <g key={i} transform={`translate(24 ${88 + i * 34})`}>
            <circle cx={7} cy={-7} r={6} fill={C.bad} />
            <text x={24} y={0} fill={C.text} fontSize={21}>
              {clip(l, 78)}
            </text>
          </g>
        ))
      )}
    </g>
  );
}

export const ReportCard = forwardRef<SVGSVGElement, Props>(function ReportCard({ report, name, weekStart, goalsBehind, nextFocus, generatedOn }, ref) {
  const s = report.stats;
  const p = report.prevStats;
  const dDone = s.completed - p.completed;
  const rate = s.completionRate === null ? '—' : `${Math.round(s.completionRate * 100)}%`;
  const learnShare = s.completedLearning + s.learnedEntries;
  const doShare = s.completedDoing + s.didEntries;
  const split = learnShare + doShare;
  const lw = split ? (learnShare / split) * 912 : 456;
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={CARD_W}
      height={CARD_H}
      className="report-card"
      role="img"
      aria-label={`${report.kind === 'week' ? 'Weekly' : 'Monthly'} report for ${rangeLabel(report)}: ${s.completed} tasks done, ${s.entries} entries, ${s.activeDays} active days.`}
      fontFamily={FONT}
    >
      <defs>
        <linearGradient id="rc-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#152031" />
          <stop offset="0.35" stopColor={C.bg} />
        </linearGradient>
        <radialGradient id="rc-glow" cx="0.85" cy="0.05" r="0.5">
          <stop offset="0" stopColor={C.gold} stopOpacity="0.22" />
          <stop offset="1" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={CARD_W} height={CARD_H} fill="url(#rc-bg)" />
      <rect width={CARD_W} height={CARD_H} fill="url(#rc-glow)" />

      <text x={60} y={82} fill={C.gold} fontSize={20} fontWeight={700} letterSpacing={4}>
        {report.kind === 'week' ? 'WEEKLY REPORT' : 'MONTHLY REPORT'}
        {!report.finished ? ' · IN PROGRESS' : ''}
      </text>
      <text x={60} y={140} fill={C.text} fontSize={50} fontWeight={760}>
        {rangeLabel(report)}
      </text>
      <text x={1020} y={82} fill={C.muted} fontSize={20} textAnchor="end">
        {clip(name, 24)} · Pursuit of Greatness
      </text>
      <text x={1020} y={140} fill={C.text} fontSize={26} fontWeight={650} textAnchor="end">
        Streak {report.streakAtEnd}d · best here {report.bestStreakInPeriod}d
      </text>

      <Kpi x={60} label="Tasks done" value={String(s.completed)} sub={`${signed(dDone)} vs last ${report.kind}`} subTone={dDone > 0 ? 'good' : dDone < 0 ? 'bad' : 'muted'} />
      <Kpi x={305} label="Finished as planned" value={rate} sub={s.scheduled ? `${s.scheduledDone} of ${s.scheduled} scheduled` : 'Nothing scheduled'} />
      <Kpi x={550} label="Journal entries" value={String(s.entries)} sub={`${s.documented} documented`} />
      <Kpi x={795} label="Points" value={String(s.points)} sub={`${signed(s.points - p.points)} vs last ${report.kind}`} subTone={s.points > p.points ? 'good' : s.points < p.points ? 'bad' : 'muted'} />

      <Growth report={report} />
      <Heatmap report={report} weekStart={weekStart} />

      <g transform="translate(60 790)">
        <rect width={960} height={110} rx={20} fill={C.panel} stroke={C.line} />
        <text x={24} y={40} fill={C.text} fontSize={22} fontWeight={700}>
          Learning vs Doing
        </text>
        <text x={936} y={40} fill={C.muted} fontSize={18} textAnchor="end">
          {learnShare} learning · {doShare} doing (tasks and entries)
        </text>
        <rect x={24} y={60} width={912} height={24} rx={12} fill={C.line} />
        {split > 0 && (
          <>
            <rect x={24} y={60} width={Math.max(lw, 0)} height={24} rx={12} fill={C.learning} />
            <rect x={24 + lw} y={60} width={Math.max(912 - lw, 0)} height={24} rx={12} fill={C.doing} />
          </>
        )}
      </g>

      <Mistakes report={report} goalsBehind={goalsBehind} />

      <g transform="translate(60 1190)">
        <rect width={960} height={96} rx={20} fill="#1b1a12" stroke={C.gold} strokeOpacity={0.5} />
        <text x={24} y={38} fill={C.gold} fontSize={18} fontWeight={700} letterSpacing={3}>
          NEXT FOCUS
        </text>
        <text x={24} y={74} fill={nextFocus ? C.text : C.faint} fontSize={24} fontWeight={nextFocus ? 650 : 400}>
          {nextFocus ? clip(nextFocus, 70) : 'Write your next focus under this report.'}
        </text>
      </g>

      <text x={60} y={1322} fill={C.faint} fontSize={17}>
        Counts only what you recorded. Made {formatMedium(generatedOn)}.
      </text>
    </svg>
  );
});

/** Draws the card SVG onto a canvas and returns a PNG blob. */
export async function svgToPng(svg: SVGSVGElement, scale = 1): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not draw the report.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W * scale;
    canvas.height = CARD_H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot export images.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
