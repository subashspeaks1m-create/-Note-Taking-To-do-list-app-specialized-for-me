import * as z from 'zod/v4';
import { INSIGHT_AREAS, SECTION_SCHEMAS, type BookInsights, type BookSummary, type MindMap, type Plan30, type Plan7, type PlanDay, type SectionId, type SectionResults } from './schema';

/**
 * Free models don't always follow a schema exactly. These helpers pull JSON
 * out of a reply and coerce it into the section shape, dropping what can't be
 * used and failing only when too little is left to be useful.
 */

export class IncompleteResultError extends Error {}

/** Extracts the JSON object from a model reply (thinking tags, code fences, prose around it). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new IncompleteResultError('The model did not return JSON. Retry, or pick another model.');
  const body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    // Common slips: trailing commas and smart quotes around keys.
    const repaired = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    try {
      return JSON.parse(repaired);
    } catch {
      throw new IncompleteResultError('The model returned broken JSON. Retry, or pick another model.');
    }
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
};
function list<T>(v: unknown, map: (item: unknown, index: number) => T | null): T[] {
  return Array.isArray(v) ? v.map(map).filter((x): x is T => x !== null) : [];
}
const strs = (v: unknown) => list(v, (x) => str(x) || str(obj(x)?.text) || null);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => {
  const s = str(v).toLowerCase() as T;
  return options.includes(s) ? s : fallback;
};

/** Unwraps `{ "summary": { … } }` style replies. */
function root(v: unknown, expectedKey: string): Obj {
  const o = obj(v) ?? {};
  if (expectedKey in o) return o;
  const keys = Object.keys(o);
  if (keys.length === 1 && obj(o[keys[0]!])) return obj(o[keys[0]!])!;
  return o;
}

function summary(v: unknown): BookSummary {
  const o = root(v, 'overview');
  const overview = Array.isArray(o.overview) ? strs(o.overview) : str(o.overview).split(/\n{2,}/).filter(Boolean);
  const result: BookSummary = {
    oneSentence: str(o.oneSentence),
    bigIdea: str(o.bigIdea),
    whoItIsFor: str(o.whoItIsFor),
    overview,
    chapters: list(o.chapters, (c) => {
      const x = obj(c);
      return x && str(x.title) ? { title: str(x.title), pages: str(x.pages), summary: str(x.summary), keyPoints: strs(x.keyPoints) } : null;
    }),
    keyConcepts: list(o.keyConcepts, (c) => {
      const x = obj(c);
      return x && str(x.term) ? { term: str(x.term), meaning: str(x.meaning) } : null;
    }),
    quotes: list(o.quotes, (q) => {
      const x = obj(q);
      return x && str(x.text) ? { text: str(x.text), page: str(x.page), whyItMatters: str(x.whyItMatters) } : null;
    }),
    caveats: strs(o.caveats),
  };
  if (!result.overview.length && !result.bigIdea) throw new IncompleteResultError('The summary came back empty. Retry, or pick another model.');
  return result;
}

function mindmap(v: unknown): MindMap {
  const o = root(v, 'branches');
  const result: MindMap = {
    center: str(o.center) || 'Core idea',
    branches: list(o.branches, (b) => {
      const x = obj(b);
      if (!x || !str(x.label)) return null;
      return {
        label: str(x.label),
        note: str(x.note),
        children: list(x.children, (c) => {
          const y = obj(c);
          if (!y || !str(y.label)) return typeof c === 'string' && c.trim() ? { label: c.trim(), note: '', children: [] } : null;
          return { label: str(y.label), note: str(y.note), children: list(y.children, (l) => (str(l) || str(obj(l)?.label) ? { label: str(l) || str(obj(l)?.label) } : null)) };
        }),
      };
    }),
  };
  if (!result.branches.length) throw new IncompleteResultError('The mind map came back empty. Retry, or pick another model.');
  return result;
}

function insights(v: unknown): BookInsights {
  const o = root(v, 'insights');
  const k = obj(o.keystoneHabit) ?? {};
  const result: BookInsights = {
    identityShift: str(o.identityShift),
    keystoneHabit: { habit: str(k.habit), why: str(k.why), cue: str(k.cue), smallestVersion: str(k.smallestVersion) },
    startDoing: strs(o.startDoing),
    stopDoing: strs(o.stopDoing),
    keepDoing: strs(o.keepDoing),
    insights: list(o.insights, (i) => {
      const x = obj(i);
      if (!x || !str(x.title)) return null;
      return {
        title: str(x.title),
        area: oneOf(x.area, INSIGHT_AREAS, 'other'),
        impact: oneOf(x.impact, ['high', 'medium', 'low'] as const, 'medium'),
        effort: oneOf(x.effort, ['easy', 'moderate', 'hard'] as const, 'moderate'),
        idea: str(x.idea),
        whyItMatters: str(x.whyItMatters),
        shiftFrom: str(x.shiftFrom),
        shiftTo: str(x.shiftTo),
        action: str(x.action),
        ifThenPlan: str(x.ifThenPlan),
        obstacle: str(x.obstacle),
        reflection: str(x.reflection),
        pages: str(x.pages),
      };
    }),
  };
  if (!result.insights.length) throw new IncompleteResultError('No insights came back. Retry, or pick another model.');
  return result;
}

function days(v: unknown): PlanDay[] {
  return list(v, (d, index) => {
    const x = obj(d);
    if (!x) return null;
    return {
      day: index + 1,
      theme: str(x.theme) || `Day ${index + 1}`,
      why: str(x.why),
      actions: list(x.actions, (a) => {
        const y = obj(a);
        const text = str(y?.text) || str(a);
        return text ? { text, minutes: Math.max(1, Math.round(num(y?.minutes, 10))), kind: oneOf(y?.kind, ['do', 'reflect', 'learn'] as const, 'do') } : null;
      }),
      reflection: str(x.reflection),
    };
  });
}

function plan7(v: unknown): Plan7 {
  const o = root(v, 'days');
  const result: Plan7 = { goal: str(o.goal), days: days(o.days).slice(0, 7) };
  if (result.days.length < 5) throw new IncompleteResultError('The 7-day plan came back incomplete. Retry, or pick another model.');
  return result;
}

function plan30(v: unknown): Plan30 {
  const o = root(v, 'days');
  const result: Plan30 = {
    goal: str(o.goal),
    weeks: list(o.weeks, (w, index) => {
      const x = obj(w);
      return x ? { week: index + 1, focus: str(x.focus), milestone: str(x.milestone) } : null;
    }).slice(0, 4),
    days: days(o.days).slice(0, 30),
    successSigns: strs(o.successSigns),
  };
  if (result.days.length < 20) throw new IncompleteResultError('The 30-day plan came back incomplete. Retry, or pick another model.');
  return result;
}

const NORMALIZERS: { [S in SectionId]: (v: unknown) => SectionResults[S] } = { summary, mindmap, insights, plan7, plan30 };

export function normalizeSection<S extends SectionId>(section: S, value: unknown): SectionResults[S] {
  return NORMALIZERS[section](value);
}

/** JSON Schema for a section, tightened for strict structured outputs. */
export function sectionJsonSchema(section: SectionId): object {
  const schema = z.toJSONSchema(SECTION_SCHEMAS[section]) as Obj;
  delete schema.$schema;
  const tighten = (node: unknown) => {
    const n = obj(node);
    if (!n) return;
    if (n.type === 'object' && obj(n.properties)) {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as Obj);
      Object.values(n.properties as Obj).forEach(tighten);
    }
    if (n.items) tighten(n.items);
  };
  tighten(schema);
  return schema;
}
