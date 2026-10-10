import { Link } from 'react-router-dom';
import { formatMedium, formatShort, type DateKey } from '../../date/localDate';
import { PLAN_DEFAULTS } from '../../domain/config';
import { sprintCountdown } from '../../domain/plans';

interface Props {
  selected: DateKey;
  today: DateKey;
}

interface DirectionSlot {
  label: string;
  placeholder: string;
}

const SLOTS: DirectionSlot[] = [
  { label: 'Today', placeholder: 'What matters most today?' },
  { label: 'This week', placeholder: "What is this week's focus?" },
  { label: 'This month', placeholder: 'What outcome will this month bring?' },
];

/**
 * Today's direction plus the three long-range plans. The period fields become
 * editable, dated records in stage 3; until then they show honest empty states.
 */
export function DirectionColumn({ selected, today }: Props) {
  const sprint = PLAN_DEFAULTS.find((p) => p.kind === 'sprint')!;
  const countdown = sprintCountdown(today, sprint.startDate, sprint.endDate);
  return (
    <aside className="direction" aria-label="Your direction">
      <p className="overline">The bigger picture</p>
      <h2 className="direction__title">Your direction</h2>

      <div className="direction__slots">
        {SLOTS.map((slot) => (
          <div key={slot.label} className="direction__slot">
            <h3 className="direction__slot-label">{slot.label === 'Today' && selected !== today ? formatShort(selected) : slot.label}</h3>
            <p className="direction__empty">{slot.placeholder}</p>
          </div>
        ))}
      </div>

      <hr className="rule" />

      <p className="overline">Connected horizons</p>
      <ul className="horizons">
        {PLAN_DEFAULTS.map((plan) => (
          <li key={plan.kind}>
            <Link to={`/visions#${plan.kind}`} className="horizon">
              <span className="horizon__title">{plan.shortTitle}</span>
              <span className="horizon__dates">
                {plan.kind === 'sprint' ? (
                  <>
                    Ends {formatMedium(plan.endDate)}
                    <span className="horizon__count"> · {countdown.label}</span>
                  </>
                ) : (
                  `${formatShort(plan.startDate)}, ${plan.startDate.slice(0, 4)} → ${formatShort(plan.endDate)}, ${plan.endDate.slice(0, 4)}`
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <hr className="rule" />
      <p className="direction__note">
        Your plans stay flexible.
        <br />
        Your history stays yours.
      </p>
    </aside>
  );
}
