import * as z from 'zod/v4';

/**
 * Shapes Claude must return for each analysis section. They double as the
 * structured-output schemas sent to the API and as runtime validation before
 * anything is saved. Structured outputs reject recursion and numeric/length
 * constraints, so the mind map has a fixed depth and limits live in prompts.
 */

export const SummarySchema = z.object({
  oneSentence: z.string().describe('The whole book in one sentence.'),
  bigIdea: z.string().describe("The book's core thesis in one short paragraph."),
  whoItIsFor: z.string().describe('Who gets the most from this book and what problem it solves for them.'),
  overview: z.array(z.string()).describe('A complete summary of the full argument, one paragraph per item.'),
  chapters: z.array(
    z.object({
      title: z.string(),
      pages: z.string().describe('PDF page range, e.g. "12–30".'),
      summary: z.string(),
      keyPoints: z.array(z.string()),
    }),
  ),
  keyConcepts: z.array(z.object({ term: z.string(), meaning: z.string() })),
  quotes: z.array(
    z.object({
      text: z.string().describe('Verbatim from the book.'),
      page: z.string(),
      whyItMatters: z.string(),
    }),
  ),
  caveats: z.array(z.string()).describe('Fair limits of the book: weak evidence, contested claims, where advice may not apply.'),
});

export const MindMapSchema = z.object({
  center: z.string(),
  branches: z.array(
    z.object({
      label: z.string(),
      note: z.string(),
      children: z.array(
        z.object({
          label: z.string(),
          note: z.string(),
          children: z.array(z.object({ label: z.string() })),
        }),
      ),
    }),
  ),
});

export const INSIGHT_AREAS = ['mindset', 'habits', 'focus', 'health', 'relationships', 'work', 'money', 'learning', 'emotions', 'other'] as const;

export const InsightsSchema = z.object({
  identityShift: z.string().describe('"I am the kind of person who …" — the identity this book invites.'),
  keystoneHabit: z.object({
    habit: z.string(),
    why: z.string(),
    cue: z.string(),
    smallestVersion: z.string().describe('A two-minute version to start with.'),
  }),
  startDoing: z.array(z.string()),
  stopDoing: z.array(z.string()),
  keepDoing: z.array(z.string()),
  insights: z.array(
    z.object({
      title: z.string(),
      area: z.enum(INSIGHT_AREAS),
      impact: z.enum(['high', 'medium', 'low']),
      effort: z.enum(['easy', 'moderate', 'hard']),
      idea: z.string().describe('What the book says, in its own terms.'),
      whyItMatters: z.string(),
      shiftFrom: z.string().describe('The current default behavior.'),
      shiftTo: z.string().describe('The new behavior.'),
      action: z.string().describe('One concrete thing to do this week.'),
      ifThenPlan: z.string().describe('"When [cue], I will [action]."'),
      obstacle: z.string().describe('The most likely way this fails, and the counter-move.'),
      reflection: z.string().describe('One question to journal on.'),
      pages: z.string(),
    }),
  ),
});

const PlanActionSchema = z.object({
  text: z.string(),
  minutes: z.number(),
  kind: z.enum(['do', 'reflect', 'learn']),
});

const PlanDaySchema = z.object({
  day: z.number(),
  theme: z.string(),
  why: z.string().describe('Which idea from the book this day practices.'),
  actions: z.array(PlanActionSchema),
  reflection: z.string().describe('Evening check-in question.'),
});

export const Plan7Schema = z.object({
  goal: z.string(),
  days: z.array(PlanDaySchema),
});

export const Plan30Schema = z.object({
  goal: z.string(),
  weeks: z.array(z.object({ week: z.number(), focus: z.string(), milestone: z.string() })),
  days: z.array(PlanDaySchema),
  successSigns: z.array(z.string()).describe('Observable signs that behavior actually changed.'),
});

export type BookSummary = z.infer<typeof SummarySchema>;
export type MindMap = z.infer<typeof MindMapSchema>;
export type BookInsights = z.infer<typeof InsightsSchema>;
export type Insight = BookInsights['insights'][number];
export type Plan7 = z.infer<typeof Plan7Schema>;
export type Plan30 = z.infer<typeof Plan30Schema>;
export type PlanDay = z.infer<typeof PlanDaySchema>;
export type PlanAction = z.infer<typeof PlanActionSchema>;

export const SECTION_SCHEMAS = {
  summary: SummarySchema,
  mindmap: MindMapSchema,
  insights: InsightsSchema,
  plan7: Plan7Schema,
  plan30: Plan30Schema,
} as const;

export type SectionId = keyof typeof SECTION_SCHEMAS;
export const SECTION_IDS = Object.keys(SECTION_SCHEMAS) as SectionId[];

export interface SectionResults {
  summary: BookSummary;
  mindmap: MindMap;
  insights: BookInsights;
  plan7: Plan7;
  plan30: Plan30;
}

export const SECTION_LABELS: Record<SectionId, string> = {
  summary: 'Summary',
  mindmap: 'Mind map',
  insights: 'Insights',
  plan7: '7-day plan',
  plan30: '30-day plan',
};
