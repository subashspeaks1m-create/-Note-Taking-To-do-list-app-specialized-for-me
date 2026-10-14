const days = (n) => Array.from({ length: n }, (_, i) => ({
  day: i + 1, theme: `Practice ${i + 1}: shrink the habit`, why: 'Make it easy',
  actions: [{ text: `Do the two-minute version of the habit (day ${i + 1})`, minutes: 2, kind: 'do' }, { text: 'Write one line about how it went', minutes: 5, kind: 'reflect' }, { text: 'Re-read pages 40-44 on habit stacking', minutes: 10, kind: 'learn' }],
  reflection: 'What made it easy or hard today?',
}));
export const fixtures = {
  summary: {
    oneSentence: 'Tiny changes, repeated daily, compound into remarkable results because systems beat goals.',
    bigIdea: 'Habits are the compound interest of self-improvement. Focus on systems and identity, not outcomes.',
    whoItIsFor: 'Anyone who sets goals but struggles to follow through.',
    overview: ['Paragraph one of the overview explains the argument.', 'Paragraph two continues with the four laws.', 'Paragraph three covers identity-based habits.'],
    chapters: [
      { title: 'The Surprising Power of Atomic Habits', pages: '1–3', summary: 'Small gains compound.', keyPoints: ['1% better every day', 'Systems over goals'] },
      { title: 'Make It Obvious', pages: '4–6', summary: 'Design cues.', keyPoints: ['Habit stacking', 'Environment design'] },
    ],
    keyConcepts: [{ term: 'Habit stacking', meaning: 'After [current habit], I will [new habit].' }, { term: 'Two-minute rule', meaning: 'Start with a version that takes under two minutes.' }],
    quotes: [{ text: 'You do not rise to the level of your goals. You fall to the level of your systems.', page: '2', whyItMatters: 'Shifts focus to process.' }],
    caveats: ['Many claims rest on anecdote.'],
  },
  mindmap: {
    center: 'Small habits compound into big results',
    branches: [
      { label: 'Identity first', note: 'Change who you are, not just what you get.', children: [{ label: 'Every action is a vote', note: 'Small wins prove identity.', children: [{ label: 'Pick the identity' }, { label: 'Prove it with small wins' }] }, { label: 'Outcome vs process', note: 'Goals set direction; systems make progress.', children: [] }] },
      { label: 'Make it obvious', note: 'Cues trigger behavior.', children: [{ label: 'Habit stacking', note: 'Anchor to an existing habit.', children: [{ label: 'After coffee, write' }] }, { label: 'Environment design', note: 'Make cues visible.', children: [{ label: 'Put the book on the pillow' }] }] },
      { label: 'Make it attractive', note: 'Cravings drive action.', children: [{ label: 'Temptation bundling', note: 'Pair want with need.', children: [] }] },
      { label: 'Make it easy', note: 'Reduce friction.', children: [{ label: 'Two-minute rule', note: 'Start tiny.', children: [{ label: 'Read one page' }, { label: 'Put on running shoes' }] }] },
      { label: 'Make it satisfying', note: 'Reward repetition.', children: [{ label: 'Habit tracking', note: 'Never miss twice.', children: [] }] },
    ],
  },
  insights: {
    identityShift: 'I am the kind of person who shows up every day, even for two minutes.',
    keystoneHabit: { habit: 'Daily two-minute start', why: 'Starting is the hardest part.', cue: 'After I pour my morning coffee', smallestVersion: 'Open the editor and write one line' },
    startDoing: ['Track one habit visibly', 'Stack new habits onto old ones'],
    stopDoing: ['Setting outcome-only goals', 'Relying on motivation'],
    keepDoing: ['Morning routine'],
    insights: [
      { title: 'Design the cue, not the willpower', area: 'habits', impact: 'high', effort: 'easy', idea: 'Behavior follows environment.', whyItMatters: 'Cues are automatic.', shiftFrom: 'Hoping to remember', shiftTo: 'Placing a visible cue', action: 'Put your guitar in the middle of the room.', ifThenPlan: 'When I finish lunch, I will practice for 5 minutes.', obstacle: 'Clutter hides cues — clear one surface.', reflection: 'Which cue in my space triggers my worst habit?', pages: '4–5' },
      { title: 'Never miss twice', area: 'mindset', impact: 'medium', effort: 'moderate', idea: 'Missing once is an accident; twice is a new habit.', whyItMatters: 'Protects streaks.', shiftFrom: 'All-or-nothing', shiftTo: 'Quick recovery', action: 'Plan a minimum version for bad days.', ifThenPlan: 'When I miss a day, I will do the two-minute version first thing next morning.', obstacle: 'Guilt spiral — forgive and restart.', reflection: 'What is my bad-day minimum?', pages: '7' },
    ],
  },
  plan7: { goal: 'Show up daily for one keystone habit.', days: days(7) },
  plan30: {
    goal: 'Run a habit system without thinking about it.',
    weeks: [1, 2, 3, 4].map((w) => ({ week: w, focus: `Week ${w} focus`, milestone: `Milestone ${w}` })),
    days: days(30),
    successSigns: ['You start without negotiating with yourself', 'Missed days are rare and never doubled'],
  },
};
