import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/Page';
import { useTodayKey } from '../../date/clock';
import { addDays, addMonths, formatKey, formatLong, formatMonthYear, formatShort, isDateKey, parseKey, startOfMonth, type DateKey } from '../../date/localDate';
import { LEVEL_NAME, type DayActivity, type IntensityLevel } from '../../domain/intensity';
import { useDayActivity } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';
import { buildDays, describeDay, monthWeeks, moveAnchor, weekDays, type CalendarView, type DaySummary } from './calendarModel';
import { useCalendarRecords, useEnsureOccurrences } from './calendarQueries';
import { DayPanel } from './DayPanel';
import { LevelMark } from './LevelMark';
import { CategoryDots } from './parts';
import { WeekView } from './WeekView';

function levelText(a: DayActivity | undefined): string {
  if (!a || a.level === 0) return 'No points yet';
  return `Level ${a.level} ${LEVEL_NAME[a.level]}, ${a.points} ${a.points === 1 ? 'point' : 'points'}`;
}

/**
 * Month and week views. Each day glows by how much you actually did (ember,
 * blaze, crystal) and carries marks for what was planned: category shapes
 * for tasks, a done/planned count and a journal marker. Selecting a day opens
 * everything it holds.
 */
export function CalendarPage() {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const weekStart = profile.weekStart ?? 'monday';
  const [params, setParams] = useSearchParams();

  const view: CalendarView = params.get('view') === 'week' ? 'week' : 'month';
  const rawDay = params.get('day');
  const rawAnchor = params.get('d');
  const selectedParam = rawDay && isDateKey(rawDay) ? rawDay : null;
  const anchor: DateKey = rawAnchor && isDateKey(rawAnchor) ? rawAnchor : (selectedParam ?? today);

  const weeks = useMemo(() => (view === 'month' ? monthWeeks(anchor, weekStart) : [weekDays(anchor, weekStart)]), [view, anchor, weekStart]);
  const dates = useMemo(() => weeks.flat(), [weeks]);
  const start = dates[0]!;
  const end = dates[dates.length - 1]!;
  const selected = selectedParam && dates.includes(selectedParam) ? selectedParam : null;

  useEnsureOccurrences(start, end, today);
  const records = useCalendarRecords(start, end);
  const activity = useDayActivity(start, end);
  const summaries = useMemo(() => (records ? buildDays({ dates, today, ...records }) : null), [records, dates, today]);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Roving focus: one day is the grid's tab stop; arrow keys move it.
  const [focusDate, setFocusDate] = useState<DateKey | null>(null);
  const pendingFocus = useRef<DateKey | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const month = parseKey(anchor).month;
  const tabDate =
    [focusDate, selected, today].find((d): d is DateKey => !!d && dates.includes(d)) ??
    (view === 'month' ? dates.find((d) => parseKey(d).month === month)! : dates[0]!);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  const go = (anchorKey: DateKey) => update({ d: anchorKey === today ? null : anchorKey, day: null });

  const moveFocus = (target: DateKey) => {
    setFocusDate(target);
    pendingFocus.current = target;
    if (!dates.includes(target)) update({ d: view === 'month' ? startOfMonth(target) : target, day: null });
  };

  const onGridKey = (e: KeyboardEvent<HTMLElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date;
    if (!from || !isDateKey(from)) return;
    const row = view === 'month' ? 7 : 1;
    const col = dates.indexOf(from) % 7;
    const steps: Record<string, () => DateKey> = {
      ArrowLeft: () => addDays(from, -1),
      ArrowRight: () => addDays(from, 1),
      ArrowUp: () => addDays(from, -row),
      ArrowDown: () => addDays(from, row),
      Home: () => addDays(from, -col),
      End: () => addDays(from, 6 - col),
      PageUp: () => (view === 'month' ? addMonths(from, -1) : addDays(from, -7)),
      PageDown: () => (view === 'month' ? addMonths(from, 1) : addDays(from, 7)),
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    moveFocus(step());
  };

  const openDay = (d: DateKey) => {
    setFocusDate(d);
    update({ day: d });
  };

  const closePanel = useCallback(() => {
    if (!selected) return;
    pendingFocus.current = selected;
    setFocusDate(selected);
    update({ day: null });
  }, [selected, update]);

  const setView = (v: CalendarView) => update({ view: v === 'week' ? 'week' : null, d: (selected ?? anchor) === today ? null : (selected ?? anchor) });

  const dayLabel = (d: DateKey) => {
    const s = summaries?.get(d);
    const parts = [formatLong(d) + (d === today ? ', today' : ''), ...(activity ? [levelText(activity.get(d))] : []), describeDay(s)];
    if (s && s.relation === 'past' && s.missedRepeats > 0) parts.push(`${s.missedRepeats} repeat missed`);
    return `${parts.join('. ')}. Show day`;
  };

  const title = view === 'month' ? formatMonthYear(anchor) : weekTitle(dates);
  const unit = view === 'month' ? 'month' : 'week';

  return (
    <div className="page page--calendar">
      <PageHeader overline="Plan and look back" title="Calendar">
        <div className="segmented" role="group" aria-label="Calendar view">
          <button type="button" className="segmented__btn" aria-pressed={view === 'month'} onClick={() => setView('month')}>
            Month
          </button>
          <button type="button" className="segmented__btn" aria-pressed={view === 'week'} onClick={() => setView('week')}>
            Week
          </button>
        </div>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label={`Previous ${unit}`} onClick={() => go(moveAnchor(anchor, view, -1))}>
            <Icon name="chevronLeft" />
          </button>
          <span className="month-nav__label" aria-live="polite">
            {title}
          </span>
          <button type="button" className="icon-btn" aria-label={`Next ${unit}`} onClick={() => go(moveAnchor(anchor, view, 1))}>
            <Icon name="chevronRight" />
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => go(today)}>
            Today
          </button>
        </div>
      </PageHeader>

      <div className={`cal-layout ${selected ? 'cal-layout--open' : ''}`}>
        <div className="cal-layout__main" ref={gridRef}>
          {view === 'month' ? (
            <MonthGrid
              weeks={weeks}
              month={month}
              label={title}
              summaries={summaries}
              activity={activity}
              today={today}
              selected={selected}
              tabDate={tabDate}
              dayLabel={dayLabel}
              onSelect={openDay}
              onKeyDown={onGridKey}
            />
          ) : (
            <WeekView
              days={dates}
              summaries={summaries}
              activity={activity}
              today={today}
              selected={selected}
              tabDate={tabDate}
              label={title}
              dayLabel={dayLabel}
              onSelect={openDay}
              onKeyDown={onGridKey}
            />
          )}
          <Legend />
        </div>
        {selected && summaries?.get(selected) && <DayPanel day={summaries.get(selected)!} activity={activity?.get(selected)} today={today} onClose={closePanel} />}
      </div>
    </div>
  );
}

function weekTitle(days: DateKey[]): string {
  const first = days[0]!;
  const last = days[6]!;
  const sameYear = parseKey(first).year === parseKey(last).year;
  return `${sameYear ? formatShort(first) : formatKey(first, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatKey(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

interface GridProps {
  weeks: DateKey[][];
  month: number;
  label: string;
  summaries: Map<DateKey, DaySummary> | null;
  activity: Map<DateKey, DayActivity> | undefined;
  today: DateKey;
  selected: DateKey | null;
  tabDate: DateKey;
  dayLabel: (d: DateKey) => string;
  onSelect: (d: DateKey) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

function MonthGrid({ weeks, month, label, summaries, activity, today, selected, tabDate, dayLabel, onSelect, onKeyDown }: GridProps) {
  const weekdayNames = weeks[0]!.map((d) => ({ short: formatKey(d, { weekday: 'short' }), long: formatKey(d, { weekday: 'long' }) }));
  return (
    <div className="cal" role="grid" aria-label={label} onKeyDown={onKeyDown}>
      <div className="cal__row cal__row--head" role="row">
        {weekdayNames.map((n) => (
          <div key={n.short} role="columnheader" className="cal__dow">
            <abbr title={n.long}>{n.short}</abbr>
          </div>
        ))}
      </div>
      {weeks.map((row) => (
        <div key={row[0]} className="cal__row" role="row">
          {row.map((d) => {
            const inMonth = parseKey(d).month === month;
            const a = activity?.get(d);
            const s = summaries?.get(d);
            const level: IntensityLevel = a?.level ?? 0;
            return (
              <div
                key={d}
                role="gridcell"
                aria-selected={selected === d}
                className={`cal__cell cal__cell--lv${level} cal__cell--${s?.relation ?? 'past'} ${inMonth ? '' : 'cal__cell--out'} ${d === today ? 'cal__cell--today' : ''} ${selected === d ? 'cal__cell--selected' : ''}`}
              >
                <button
                  type="button"
                  className="cal__day"
                  data-date={d}
                  tabIndex={d === tabDate ? 0 : -1}
                  aria-current={d === today ? 'date' : undefined}
                  aria-label={dayLabel(d)}
                  title={`${levelText(a)}. ${describeDay(s)}`}
                  onClick={() => onSelect(d)}
                >
                  <span className="cal__top">
                    <span className="cal__num tabular">{parseKey(d).day}</span>
                    {s && s.entries.length > 0 && (
                      <span className="cal__journal tabular" aria-hidden="true">
                        <Icon name="journal" size={12} />
                        <span className="cal__journal-n">{s.entries.length}</span>
                      </span>
                    )}
                  </span>
                  {level > 0 && (
                    <span className="cal__mark">
                      <LevelMark level={level} />
                      <span className="cal__lvl">Lv {level}</span>
                    </span>
                  )}
                  {s && (s.planned > 0 || s.overdue > 0) && (
                    <span className="cal__foot" aria-hidden="true">
                      <CategoryDots tasks={s.scheduled} max={5} />
                      {s.planned > 0 && <span className="cal__count tabular">{`${s.done}/${s.planned}`}</span>}
                      {s.overdue > 0 && <span className="cal__late">!</span>}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
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
      <ul className="cal-key" aria-label="Day marks">
        <li>
          <span className="cat-shape cat-shape--learning cat-shape--done" aria-hidden="true" /> Learning task
        </li>
        <li>
          <span className="cat-shape cat-shape--doing cat-shape--done" aria-hidden="true" /> Doing task
        </li>
        <li>
          <span className="cat-shape cat-shape--learning" aria-hidden="true" />
          <span className="cat-shape cat-shape--doing" aria-hidden="true" /> Hollow: planned, not done yet
        </li>
        <li>
          <span className="cal-key__count tabular" aria-hidden="true">
            2/3
          </span>
          Done of planned
        </li>
        <li>
          <span className="cal__journal" aria-hidden="true">
            <Icon name="journal" size={12} />
          </span>
          Journal entries
        </li>
        <li>
          <span className="cal__late" aria-hidden="true">
            !
          </span>
          Still open from a past day
        </li>
      </ul>
    </div>
  );
}
