import { useState } from 'react';
import { Art } from '../../components/art/Art';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { addDays, addMonths, endOfMonth, formatMedium, formatShort, startOfMonth, startOfWeek, type DateKey } from '../../date/localDate';
import type { PeriodDirection } from '../../domain/models';
import { sprintCountdown } from '../../domain/plans';
import { useDirection, usePlans, usePrinciples } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';

interface Props {
  selected: DateKey;
  today: DateKey;
}

interface Period {
  kind: PeriodDirection['kind'];
  key: string;
  start: DateKey;
  end: DateKey;
  previousKey: string;
  label: string;
  placeholder: string;
}

function periodsFor(selected: DateKey, today: DateKey, weekStart: 'monday' | 'sunday'): Period[] {
  const week = startOfWeek(selected, weekStart);
  const month = startOfMonth(selected);
  return [
    { kind: 'day', key: selected, start: selected, end: selected, previousKey: addDays(selected, -1), label: selected === today ? 'Today' : formatShort(selected), placeholder: 'What matters most today?' },
    { kind: 'week', key: week, start: week, end: addDays(week, 6), previousKey: addDays(week, -7), label: week === startOfWeek(today, weekStart) ? 'This week' : `Week of ${formatShort(week)}`, placeholder: "What is this week's focus?" },
    { kind: 'month', key: month.slice(0, 7), start: month, end: endOfMonth(month), previousKey: addMonths(month, -1).slice(0, 7), label: month === startOfMonth(today) ? 'This month' : formatKeyMonth(month), placeholder: 'What outcome will this month bring?' },
  ];
}

function formatKeyMonth(key: DateKey): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** One period's intention: read as a line, tap to edit, saved with history. */
function DirectionSlot({ period }: { period: Period }) {
  const repo = useRepo();
  const toast = useToast();
  const current = useDirection(period.kind, period.key);
  const previous = useDirection(period.kind, period.previousKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const text = current?.intention ?? '';

  const save = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next === text) return;
    try {
      await repo.saveDirection({ kind: period.kind, periodKey: period.key, startDate: period.start, endDate: period.end, intention: next });
    } catch (e) {
      setDraft(next);
      setEditing(true);
      toast({ message: `Couldn't save. ${(e as Error).message}`, tone: 'error' });
    }
  };

  return (
    <div className="direction__slot">
      <h3 className="direction__slot-label">{period.label}</h3>
      {editing ? (
        <textarea
          className="input input--area direction__input"
          aria-label={`${period.label}: ${period.placeholder}`}
          rows={2}
          autoFocus
          value={draft}
          maxLength={280}
          placeholder={period.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`direction__value ${text ? '' : 'direction__value--empty'}`}
          onClick={() => {
            setDraft(text);
            setEditing(true);
          }}
          aria-label={text ? `${period.label}: ${text}. Edit` : `Set ${period.label.toLowerCase()}: ${period.placeholder}`}
        >
          {text || period.placeholder}
        </button>
      )}
      {!editing && !text && previous?.intention && (
        <button
          type="button"
          className="link-btn link-btn--quiet direction__carry"
          onClick={() => {
            setDraft(previous.intention);
            setEditing(true);
          }}
        >
          Start from last {period.kind === 'day' ? 'day' : period.kind}'s
        </button>
      )}
    </div>
  );
}

/** Today's direction plus the long-range plans, each linking to its page. */
/** The number one principle, kept in sight every day. */
function TopPrinciple() {
  const principles = usePrinciples();
  const top = principles?.[0];
  if (!principles) return null;
  return (
    <Link to="/principles" className="top-principle art-host">
      <span className="top-principle__label">
        <Art name="crown" size={18} motion="bounce" /> My #1 principle
      </span>
      {top ? <span className="top-principle__text">{top.text}</span> : <span className="top-principle__empty">Write the one rule you follow every single time.</span>}
    </Link>
  );
}

export function DirectionColumn({ selected, today }: Props) {
  const profile = useProfile();
  const plans = usePlans();
  const sprint = plans?.find((p) => p.kind === 'sprint');
  const periods = periodsFor(selected, today, profile.weekStart ?? 'monday');
  const ordered = [...(plans ?? [])].sort((a, b) => ['decade', 'year', 'sprint'].indexOf(a.kind) - ['decade', 'year', 'sprint'].indexOf(b.kind));

  return (
    <aside className="direction" aria-label="Your direction">
      <TopPrinciple />
      <p className="overline">The bigger picture</p>
      <h2 className="direction__title panel__title--art art-host">
        <Art name="compass" size={26} motion="spin" />
        Your direction
      </h2>

      <div className="direction__slots">
        {periods.map((p) => (
          <DirectionSlot key={`${p.kind}-${p.key}`} period={p} />
        ))}
      </div>

      <hr className="rule" />

      <p className="overline">Connected horizons</p>
      <ul className="horizons">
        {ordered.map((plan) => (
          <li key={plan.id}>
            <Link to={`/visions/${plan.id}`} className="horizon">
              <span className="horizon__title">{plan.title}</span>
              <span className="horizon__dates">
                {plan.kind === 'sprint' ? (
                  <>
                    Ends {formatMedium(plan.endDate)}
                    <span className="horizon__count"> · {sprintCountdown(today, plan.startDate, plan.endDate).label}</span>
                  </>
                ) : (
                  `${formatShort(plan.startDate)}, ${plan.startDate.slice(0, 4)} → ${formatShort(plan.endDate)}, ${plan.endDate.slice(0, 4)}`
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!sprint && plans && plans.length === 0 && <p className="direction__empty">No active plans.</p>}

      <Link to="/visions?view=map" className="direction__map">
        <Icon name="orbit" size={16} /> Open the mind map
      </Link>
    </aside>
  );
}
