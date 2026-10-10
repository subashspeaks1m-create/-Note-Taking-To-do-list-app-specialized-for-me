import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader, StageNote } from '../../components/Page';
import { useTodayKey } from '../../date/clock';
import {
  addDays, addMonths, endOfMonth, formatKey, formatLong, formatMonthYear, parseKey, startOfMonth, startOfWeek,
  type DateKey,
} from '../../date/localDate';
import { LEVEL_NAME, type DayActivity, type IntensityLevel } from '../../domain/intensity';
import { useDayActivity } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';
import { LevelMark } from './LevelMark';

function describe(a: DayActivity | undefined): string {
  if (!a) return 'No activity';
  const parts = [
    a.completed && `${a.completed} done`,
    a.entries && `${a.entries} ${a.entries === 1 ? 'entry' : 'entries'}`,
    a.goalLogs && `${a.goalLogs} goal ${a.goalLogs === 1 ? 'log' : 'logs'}`,
  ].filter(Boolean);
  return `Level ${a.level} ${LEVEL_NAME[a.level]}: ${parts.join(', ')}`;
}

/** Month grid where each day glows by how much you actually did: ember, blaze, crystal. */
export function CalendarPage() {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const [cursor, setCursor] = useState<DateKey>(() => startOfMonth(today));
  const weekStart = profile.weekStart ?? 'monday';

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

  const activity = useDayActivity(weeks[0]![0]!, weeks[weeks.length - 1]![6]!);
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
              const a = activity?.get(d);
              const level: IntensityLevel = a?.level ?? 0;
              return (
                <div key={d} role="gridcell" className={`cal__cell cal__cell--lv${level} ${inMonth ? '' : 'cal__cell--out'} ${d === today ? 'cal__cell--today' : ''}`}>
                  <Link
                    to={d === today ? '/' : `/?date=${d}`}
                    className="cal__day"
                    title={describe(a)}
                    aria-label={`${formatLong(d)}${d === today ? ', today' : ''}. ${describe(a)}. Open this day`}
                  >
                    <span className="cal__num tabular">{parseKey(d).day}</span>
                    {level > 0 && (
                      <span className="cal__mark">
                        <LevelMark level={level} />
                        <span className="cal__lvl">Lv {level}</span>
                      </span>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="lvl-legend">
        <p className="lvl-legend__how">Each day earns 1 point per finished task or habit, journal entry, and goal log or check-in.</p>
        <ul className="lvl-legend__list">
          {([1, 2, 3] as const).map((lv) => (
            <li key={lv} className={`lvl-legend__item lvl-legend__item--${lv}`}>
              <LevelMark level={lv} size={22} />
              <span>
                <strong>
                  Level {lv} · {LEVEL_NAME[lv]}
                </strong>
                <span className="lvl-legend__pts">{lv === 1 ? '1–2 points' : lv === 2 ? '3–5 points' : '6+ points'}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <StageNote stage={4}>Task dots, week view and the day panel arrive in stage 4.</StageNote>
    </div>
  );
}
