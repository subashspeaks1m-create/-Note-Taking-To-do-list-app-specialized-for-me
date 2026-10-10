import type { DateKey } from '../../date/localDate';
import {
  computeStreak, descendantIds, goalActivityDates, goalPace, goalProgress, planAchievement, type GoalProgress, type Pace, type Streak,
} from '../../domain/goals';
import type { Goal, GoalUpdate, ID, Milestone, Task, TaskSeries, VisionPlan } from '../../domain/models';
import type { GoalBoard } from '../../storage/queries';

export interface GoalView {
  goal: Goal;
  plan: VisionPlan | null;
  progress: GoalProgress;
  pace: Pace;
  streak: Streak;
  /** Days with goal activity, for small history strips. */
  activeDates: Set<DateKey>;
  milestones: Milestone[];
  habits: TaskSeries[];
  /** Tasks linked to this goal or any sub-goal, each once. */
  tasks: Task[];
  updates: GoalUpdate[];
  children: Goal[];
}

export interface PlanView {
  plan: VisionPlan;
  goals: GoalView[];
  achievement: ReturnType<typeof planAchievement>;
}

export interface BoardModel {
  plans: PlanView[];
  goalViews: Map<ID, GoalView>;
}

const PLAN_ORDER: Record<VisionPlan['kind'], number> = { decade: 0, year: 1, sprint: 2 };

/** The plan a goal belongs to, walking up parents for sub-goals filed without one. */
function planFor(goal: Goal, byId: Map<ID, Goal>, plans: Map<ID, VisionPlan>): VisionPlan | null {
  const seen = new Set<ID>();
  let cur: Goal | undefined = goal;
  while (cur && !seen.has(cur.id)) {
    if (cur.planId) return plans.get(cur.planId) ?? null;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

export function buildBoard(board: GoalBoard, today: DateKey, opts: { includeArchived?: boolean } = {}): BoardModel {
  const goals = board.goals.filter((g) => opts.includeArchived || g.status !== 'archived');
  const byId = new Map(goals.map((g) => [g.id, g]));
  const plansById = new Map(board.plans.map((p) => [p.id, p]));
  const goalViews = new Map<ID, GoalView>();

  for (const goal of goals) {
    const scope = new Set([goal.id, ...descendantIds(goals, goal.id)]);
    const tasks = board.tasks.filter((t) => t.goalIds.some((id) => scope.has(id)));
    const milestones = board.milestones.filter((m) => m.goalId === goal.id);
    const updates = board.updates.filter((u) => u.goalId === goal.id);
    const entryDates = board.entries
      .filter((e) => e.documentedAt && (e.goalIds.some((id) => scope.has(id)) || e.taskIds.some((id) => tasks.some((t) => t.id === id))))
      .map((e) => e.dateKey);
    const activeDates = goalActivityDates({ tasks, updates: board.updates.filter((u) => scope.has(u.goalId)), entryDates });
    const plan = planFor(goal, byId, plansById);
    const progress = goalProgress(goal, milestones, tasks);
    goalViews.set(goal.id, {
      goal,
      plan,
      progress,
      pace: goal.status === 'achieved' ? { state: 'done', expectedFraction: 1, label: 'Achieved' } : goalPace(progress, plan, today),
      streak: computeStreak(activeDates, today),
      activeDates,
      milestones,
      habits: board.series.filter((s) => s.goalIds.includes(goal.id)),
      tasks,
      updates,
      children: goals.filter((g) => g.parentId === goal.id),
    });
  }

  const plans = board.plans
    .filter((p) => opts.includeArchived || !p.archivedAt)
    .sort((a, b) => PLAN_ORDER[a.kind] - PLAN_ORDER[b.kind] || a.startDate.localeCompare(b.startDate))
    .map((plan) => {
      const top = goals.filter((g) => g.planId === plan.id && !(g.parentId && byId.has(g.parentId))).map((g) => goalViews.get(g.id)!);
      return { plan, goals: top, achievement: planAchievement(top.map((v) => v.progress)) };
    });

  return { plans, goalViews };
}
