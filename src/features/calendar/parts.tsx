import type { Category } from '../../domain/config';
import type { CalendarTask } from './calendarModel';

export const CATEGORY_LABEL: Record<Category, string> = { learning: 'Learning', doing: 'Doing' };

/** Learning is a circle, doing a diamond; filled once done, hollow while planned. */
export function CategoryShape({ category, filled, className = '' }: { category: Category; filled: boolean; className?: string }) {
  return <span className={`cat-shape cat-shape--${category} ${filled ? 'cat-shape--done' : ''} ${className}`} aria-hidden="true" />;
}

const order = (t: CalendarTask) => (t.category === 'learning' ? 0 : 2) + (t.status === 'completed' ? 0 : 1);

/** Small category marks for a day's scheduled tasks. Decorative: the day's label carries the counts. */
export function CategoryDots({ tasks, max }: { tasks: CalendarTask[]; max: number }) {
  const shown = tasks.filter((t) => t.status !== 'canceled').sort((a, b) => order(a) - order(b));
  if (shown.length === 0) return null;
  const extra = shown.length - max;
  return (
    <span className="cal-dots" aria-hidden="true">
      {shown.slice(0, extra > 0 ? max - 1 : max).map((t) => (
        <CategoryShape key={t.id} category={t.category} filled={t.status === 'completed'} />
      ))}
      {extra > 0 && <span className="cal-dots__more">+{extra + 1}</span>}
    </span>
  );
}

export function statusLabel(t: Pick<CalendarTask, 'status'>): string {
  return t.status === 'completed' ? 'Done' : t.status === 'in-progress' ? 'In progress' : t.status === 'canceled' ? 'Canceled' : 'Open';
}
