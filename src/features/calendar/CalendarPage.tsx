import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader, StageNote } from '../../components/Page';
import { useTodayKey } from '../../date/clock';
import {
  addDays, addMonths, endOfMonth, formatKey, formatLong, formatMonthYear, parseKey, startOfMonth, startOfWeek,
  type DateKey,
} from '../../date/localDate';
import { PROFILE_DEFAULTS } from '../../domain/config';

/** A real month grid. Task and journal markers fill in once storage exists (stage 2+). */
export function CalendarPage() {
  const today = useTodayKey(PROFILE_DEFAULTS.timeZone);
  const [cursor, setCursor] = useState<DateKey>(() => startOfMonth(today));
  const weekStart = PROFILE_DEFAULTS.weekStart;

  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(cursor), weekStart);
    const last = endOfMonth(cursor);
    const rows: DateKey[][] = [];
    let day = first;
    while (rows.length < 6 && (rows.length === 0 || day <= last)) {
      const row: DateKey[] = [];
      for (let i = 0; i < 7; i++) {
        row.push(day);
        day = addDays(day, 1);
      }
      rows.push(row);
    }
    return rows;
  }, [cursor, weekStart]);

  const month = parseKey(cursor).month;
  const weekdayNames = weeks[0]!.map((d) => formatKey(d, { weekday: 'short' }));

  return (
    <div className="page">
      <PageHeader overline="Plan and look back" title="Calendar">
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
            <Icon name="chevronLeft" />
          </button>
          <span className="month-nav__label" aria-live="polite">
            {formatMonthYear(cursor)}
          </span>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
            <Icon name="chevronRight" />
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setCursor(startOfMonth(today))}>
            Today
          </button>
        </div>
      </PageHeader>

      <div className="cal" role="grid" aria-label={formatMonthYear(cursor)}>
        <div className="cal__row cal__row--head" role="row">
          {weekdayNames.map((n) => (
            <div key={n} role="columnheader" className="cal__dow">
              {n}
            </div>
          ))}
        </div>
        {weeks.map((row) => (
          <div key={row[0]} className="cal__row" role="row">
            {row.map((d) => {
              const inMonth = parseKey(d).month === month;
              return (
                <div key={d} role="gridcell" className={`cal__cell ${inMonth ? '' : 'cal__cell--out'} ${d === today ? 'cal__cell--today' : ''}`}>
                  <Link to={d === today ? '/' : `/?date=${d}`} className="cal__day" aria-label={`${formatLong(d)}${d === today ? ', today' : ''}. Open this day`}>
                    <span className="cal__num tabular">{parseKey(d).day}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="cal-legend" aria-hidden="true">
        <span className="cal-legend__item cal-legend__item--learning">Learning</span>
        <span className="cal-legend__item cal-legend__item--doing">Doing</span>
        <span className="cal-legend__item cal-legend__item--journal">Journal entry</span>
      </div>

      <StageNote stage={4}>Task dots, entry counts, week view and the activity heatmap fill in from your real data in stage 4.</StageNote>
    </div>
  );
}
