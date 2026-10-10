import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { formatKey, parseKey, type DateKey } from '../../date/localDate';
import type { DayActivity } from '../../domain/intensity';
import { entryTitle, type DaySummary } from './calendarModel';
import { LevelMark } from './LevelMark';
import { CategoryShape, statusLabel } from './parts';

interface Props {
  days: DateKey[];
  summaries: Map<DateKey, DaySummary> | null;
  activity: Map<DateKey, DayActivity> | undefined;
  today: DateKey;
  selected: DateKey | null;
  tabDate: DateKey;
  label: string;
  dayLabel: (d: DateKey) => string;
  onSelect: (d: DateKey) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/** Seven columns (stacked on mobile) listing each day's focus, tasks and entries. */
export function WeekView({ days, summaries, activity, today, selected, tabDate, label, dayLabel, onSelect, onKeyDown }: Props) {
  return (
    <div className="cal-week" role="grid" aria-label={label} onKeyDown={onKeyDown}>
      <div className="cal-week__row" role="row">
        {days.map((d) => {
          const s = summaries?.get(d);
          const level = activity?.get(d)?.level ?? 0;
          return (
            <div
              key={d}
              role="gridcell"
              aria-selected={selected === d}
              className={`cal-week__day cal-week__day--${s?.relation ?? 'past'} ${d === today ? 'cal-week__day--today' : ''} ${selected === d ? 'cal-week__day--selected' : ''} cal__cell--lv${level}`}
            >
              <button
                type="button"
                className="cal-week__head"
                data-date={d}
                tabIndex={d === tabDate ? 0 : -1}
                aria-current={d === today ? 'date' : undefined}
                aria-label={dayLabel(d)}
                onClick={() => onSelect(d)}
              >
                <span className="cal-week__dow">{formatKey(d, { weekday: 'short' })}</span>
                <span className="cal__num tabular">{parseKey(d).day}</span>
                {level > 0 && <LevelMark level={level} size={20} />}
                {s && s.planned > 0 && (
                  <span className="cal-week__count tabular" aria-hidden="true">
                    {s.done}/{s.planned}
                  </span>
                )}
              </button>

              <div className="cal-week__body">
                {s?.intention && (
                  <p className="cal-week__focus">
                    <span className="cal-week__focus-label">Focus</span> {s.intention}
                  </p>
                )}
                {s && s.scheduled.length > 0 && (
                  <ul className="cal-week__tasks" aria-label="Tasks">
                    {s.scheduled.map((t) => (
                      <li key={t.id} className={`cal-week__task cal-week__task--${t.status}`}>
                        <CategoryShape category={t.category} filled={t.status === 'completed'} />
                        <span className="cal-week__task-title">{t.title}</span>
                        {t.seriesId && (
                          <span className="cal-week__repeat" aria-hidden="true">
                            ↻
                          </span>
                        )}
                        {t.status === 'completed' && <Icon name="check" size={13} className="cal-week__check" />}
                        <span className="visually-hidden">
                          , {t.category}, {statusLabel(t)}
                          {t.seriesId ? ', repeats' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {s && s.overdue > 0 && (
                  <p className="cal-week__late">
                    <span aria-hidden="true">!</span> {s.overdue} still open
                  </p>
                )}
                {s && s.completedElsewhere.length > 0 && <p className="cal-week__extra">+{s.completedElsewhere.length} finished from other days</p>}
                {s && s.entries.length > 0 && (
                  <ul className="cal-week__entries" aria-label="Journal entries">
                    {s.entries.map((e) => (
                      <li key={e.id}>
                        <Link to={`/journal/${e.id}`} className="cal-week__entry" tabIndex={-1}>
                          <Icon name="journal" size={13} />
                          <span>{entryTitle(e)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {s && !s.intention && s.scheduled.length === 0 && s.entries.length === 0 && s.completedElsewhere.length === 0 && (
                  <p className="cal-week__empty">{s.relation === 'future' ? 'Open' : 'Quiet'}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
