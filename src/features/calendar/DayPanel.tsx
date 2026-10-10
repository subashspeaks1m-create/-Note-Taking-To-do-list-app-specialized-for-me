import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { diffDays, formatLong, formatShort, type DateKey } from '../../date/localDate';
import { LEVEL_NAME, type DayActivity } from '../../domain/intensity';
import { entryTitle, snippet, type CalendarTask, type DaySummary } from './calendarModel';
import { LevelMark } from './LevelMark';
import { CATEGORY_LABEL, CategoryShape, statusLabel } from './parts';

const ENTRY_KIND_LABEL = { learning: 'Learning', doing: 'Doing', reflection: 'Reflection' } as const;

function relationText(date: DateKey, today: DateKey): string {
  const n = diffDays(today, date);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return n < 0 ? `${-n} days ago` : `${n} days after today`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function TaskLine({ task, note }: { task: CalendarTask; note?: string }) {
  const done = task.status === 'completed';
  return (
    <li className={`day-task day-task--${task.status}`}>
      <CategoryShape category={task.category} filled={done} className="day-task__shape" />
      <span className="day-task__main">
        <span className="day-task__title">{task.title}</span>
        <span className="day-task__meta">
          <span className={`day-task__status day-task__status--${task.status}`}>
            {done && <Icon name="check" size={12} />}
            {statusLabel(task)}
          </span>
          <span>{CATEGORY_LABEL[task.category]}</span>
          {task.seriesId && <span title="Repeating task">↻ Repeats</span>}
          {note && <span>{note}</span>}
        </span>
      </span>
    </li>
  );
}

interface Props {
  day: DaySummary;
  activity: DayActivity | undefined;
  today: DateKey;
  onClose: () => void;
}

/** Everything one day holds: its level, planned focus, tasks and journal. Side panel on desktop, bottom sheet on mobile. */
export function DayPanel({ day, activity, today, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const level = activity?.level ?? 0;
  const { date } = day;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const future = day.relation === 'future';
  const plannedLine = day.planned === 0 ? null : future ? `${count(day.planned, 'task')} planned` : `${day.done} of ${day.planned} done`;

  return (
    <>
      <div className="day-panel-backdrop" aria-hidden="true" onClick={onClose} />
      <aside className={`day-panel day-panel--lv${level}`} role="dialog" aria-labelledby="day-panel-title">
        <span className="day-panel__handle" aria-hidden="true" />
        <header className="day-panel__head">
          <div>
            <p className="overline">{relationText(date, today)}</p>
            <h2 id="day-panel-title" className="day-panel__title" ref={headingRef} tabIndex={-1}>
              {formatLong(date)}
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close day" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="day-panel__body">
          <section className="day-level" aria-label="Day level">
            <span className="day-level__mark">{level > 0 ? <LevelMark level={level} size={30} /> : <span className="day-level__quiet" aria-hidden="true" />}</span>
            <div>
              <p className="day-level__name">
                {level > 0 ? `Level ${level} · ${LEVEL_NAME[level]}` : future ? 'Not lived yet' : 'Quiet day'}
                <span className="day-level__pts tabular">{count(activity?.points ?? 0, 'point')}</span>
              </p>
              <p className="day-level__how tabular">
                {count(activity?.completed ?? 0, 'task')} finished · {count(activity?.entries ?? 0, 'entry', 'entries')} · {count(activity?.goalLogs ?? 0, 'goal log')}
              </p>
            </div>
          </section>

          <section className="day-sec">
            <h3 className="day-sec__title">Planned focus</h3>
            {day.intention ? (
              <>
                <p className="day-focus">{day.intention}</p>
                {day.desiredOutcome && <p className="day-focus__outcome">Outcome: {day.desiredOutcome}</p>}
              </>
            ) : (
              <p className="day-sec__empty">No focus written for this day.</p>
            )}
          </section>

          <section className="day-sec">
            <h3 className="day-sec__title">
              Scheduled tasks {plannedLine && <span className="day-sec__count tabular">{plannedLine}</span>}
            </h3>
            {day.scheduled.length === 0 ? (
              <p className="day-sec__empty">{future ? 'Nothing scheduled yet.' : 'No tasks were scheduled.'}</p>
            ) : (
              <ul className="day-tasks">
                {day.scheduled.map((t) => (
                  <TaskLine key={t.id} task={t} note={t.status === 'completed' && t.completionLocalDate && t.completionLocalDate !== date ? `Finished ${formatShort(t.completionLocalDate)}` : undefined} />
                ))}
              </ul>
            )}
            {day.overdue > 0 && (
              <p className="day-sec__note day-sec__note--late">
                <span aria-hidden="true">!</span> {count(day.overdue, 'task')} still open. {day.overdue === 1 ? 'It carries' : 'They carry'} over to Today until done or moved.
              </p>
            )}
            {day.missedRepeats > 0 && <p className="day-sec__note">Missed repeats stay on their own day and never pile up.</p>}
          </section>

          {day.completedElsewhere.length > 0 && (
            <section className="day-sec">
              <h3 className="day-sec__title">
                Finished from other days <span className="day-sec__count tabular">{day.completedElsewhere.length}</span>
              </h3>
              <ul className="day-tasks">
                {day.completedElsewhere.map((t) => (
                  <TaskLine key={t.id} task={t} note={t.scheduledDate ? `Scheduled ${formatShort(t.scheduledDate)}` : 'Unscheduled'} />
                ))}
              </ul>
            </section>
          )}

          <section className="day-sec">
            <h3 className="day-sec__title">
              Journal {day.entries.length > 0 && <span className="day-sec__count tabular">{count(day.entries.length, 'entry', 'entries')}</span>}
            </h3>
            {day.entries.length === 0 ? (
              <p className="day-sec__empty">{future ? 'Entries appear once the day is written.' : 'Nothing written this day.'}</p>
            ) : (
              <ul className="day-entries">
                {day.entries.map((e) => (
                  <li key={e.id}>
                    <Link to={`/journal/${e.id}`} className="day-entry">
                      <span className="day-entry__title">
                        <Icon name="journal" size={14} /> {entryTitle(e)}
                      </span>
                      <span className="day-entry__kind">{ENTRY_KIND_LABEL[e.kind]}</span>
                      {e.title.trim() && e.plainText.trim() && <span className="day-entry__snippet">{snippet(e.plainText)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="day-panel__foot">
          <Link to={date === today ? '/' : `/?date=${date}`} className="btn btn--primary day-panel__open">
            Open this day <Icon name="chevronRight" size={16} />
          </Link>
        </footer>
      </aside>
    </>
  );
}
