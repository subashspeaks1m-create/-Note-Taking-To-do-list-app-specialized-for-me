import type { BookRecord } from './db';
import type { Plan30, Plan7, PlanDay } from './schema';

/** The whole analysis as Markdown, for notes apps and backups. */
export function bookToMarkdown(book: BookRecord): string {
  const { summary, mindmap, insights, plan7, plan30 } = book.results;
  const out: string[] = [`# ${book.title}`];
  if (book.author) out.push(`*${book.author}*`);
  if (book.goal.trim()) out.push(`> My goal: ${book.goal.trim()}`);

  if (summary) {
    out.push('## Summary', `**In one sentence:** ${summary.oneSentence}`, `**The big idea:** ${summary.bigIdea}`, `**Who it's for:** ${summary.whoItIsFor}`, ...summary.overview);
    out.push('### Chapter by chapter');
    for (const c of summary.chapters) {
      out.push(`#### ${c.title}${c.pages ? ` (p. ${c.pages})` : ''}`, c.summary, ...c.keyPoints.map((p) => `- ${p}`));
    }
    if (summary.keyConcepts.length) out.push('### Key concepts', ...summary.keyConcepts.map((k) => `- **${k.term}**: ${k.meaning}`));
    if (summary.quotes.length) out.push('### Quotes', ...summary.quotes.map((q) => `> "${q.text}" (p. ${q.page})\n>\n> ${q.whyItMatters}`));
    if (summary.caveats.length) out.push('### Caveats', ...summary.caveats.map((c) => `- ${c}`));
  }

  if (mindmap) {
    out.push('## Mind map', `**${mindmap.center}**`);
    for (const b of mindmap.branches) {
      out.push(`- **${b.label}**: ${b.note}`);
      for (const c of b.children) {
        out.push(`  - ${c.label}: ${c.note}`);
        for (const l of c.children) out.push(`    - ${l.label}`);
      }
    }
  }

  if (insights) {
    out.push('## Behavior change', `**Identity:** ${insights.identityShift}`);
    const k = insights.keystoneHabit;
    out.push(`**Keystone habit:** ${k.habit}. ${k.why} Cue: ${k.cue}. Start with: ${k.smallestVersion}`);
    out.push('**Start doing**', ...insights.startDoing.map((s) => `- ${s}`));
    out.push('**Stop doing**', ...insights.stopDoing.map((s) => `- ${s}`));
    out.push('**Keep doing**', ...insights.keepDoing.map((s) => `- ${s}`));
    out.push('### Insights');
    insights.insights.forEach((i, n) => {
      out.push(
        `#### ${n + 1}. ${i.title}`,
        `*${i.area} · ${i.impact} impact · ${i.effort}${i.pages ? ` · p. ${i.pages}` : ''}*`,
        i.idea,
        `- **Why it matters:** ${i.whyItMatters}`,
        `- **From:** ${i.shiftFrom}`,
        `- **To:** ${i.shiftTo}`,
        `- **Do this:** ${i.action}`,
        `- **If-then plan:** ${i.ifThenPlan}`,
        `- **Watch out:** ${i.obstacle}`,
        `- **Reflect:** ${i.reflection}`,
      );
    });
  }

  const planDays = (days: PlanDay[], done: Record<string, true> = {}) =>
    days.flatMap((d) => [
      `#### Day ${d.day}: ${d.theme}`,
      `*${d.why}*`,
      ...d.actions.map((a, i) => `- [${done[`${d.day}:${i}`] ? 'x' : ' '}] ${a.text} (${a.minutes} min, ${a.kind})`),
      `- Reflect: ${d.reflection}`,
    ]);

  if (plan7) out.push('## 7-day roadmap', `**Goal:** ${plan7.goal}`, ...planDays((plan7 as Plan7).days, book.practice.plan7?.done));
  if (plan30) {
    const p = plan30 as Plan30;
    out.push('## 30-day roadmap', `**Goal:** ${p.goal}`, ...p.weeks.map((w) => `- **Week ${w.week}: ${w.focus}.** Milestone: ${w.milestone}`));
    out.push(...planDays(p.days, book.practice.plan30?.done));
    if (p.successSigns.length) out.push('### Signs it is working', ...p.successSigns.map((s) => `- ${s}`));
  }

  return out.join('\n\n') + '\n';
}

export function downloadText(fileName: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string): string {
  return title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'book';
}
