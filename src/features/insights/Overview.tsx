import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { addDays, compareKeys, formatKey, formatMedium, formatShort, startOfWeek, type DateKey, type WeekStart } from '../../date/localDate';
import type { Streak } from '../../domain/goals';
import { dayActivity, LEVEL_NAME, type IntensityLevel } from '../../domain/intensity';
import { compareToDate, consistency, periodStats, personalBests, qualifyingDays, weeklyTrend, type ActivitySource, type Delta } from '../../domain/stats';
import type { GoalView } from '../visions/boardModel';
import { PaceChip } from '../visions/parts';

interface Props {
  source: ActivitySource;
  today: DateKey;
  weekStart: WeekStart;
  goals: GoalView[];
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

export function Overview({ source, today, weekStart, goals }: Props) {
  const habit = useMemo(() => consistency(source, today, weekStart), [source, today, weekStart]);
  const bests = useMemo(() => personalBests(source, today, weekStart), [source, today, weekStart]);
  const vs = useMemo(
    () => ({
      day: compareToDate(source, 'day', today, weekStart),
      week: compareToDate(source, 'week', today, weekStart),
      month: compareToDate(source, 'month', today, weekStart),
    }),
    [source, today, weekStart],
  );
  const last30 = useMemo(() => periodStats(source, { start: addDays(today, -29), end: today }, today), [source, today]);
  const trend = useMemo(() => weeklyTrend(source, today, weekStart, 12), [source, today, weekStart]);
  const empty = bests.totalCompleted === 0 && source.entries.length === 0 && source.updates.length === 0;

  return (
    <div className="insights">
      <section className="ins-hero" aria-label="Consistency">
        <StreakBlock title="Streak" streak={habit.streak} big />
        <div className="ins-week" aria-label={`${habit.last7} of the last 7 days active`}>
          <p className="ins-label">Last 7 days</p>
          <p className="ins-big tabular">
            {habit.last7}
            <span className="ins-big__of">/7</span>
          </p>
          <SevenDots source={source} today={today} />
          <p className="ins-note">A day counts with a finished task or a documented entry.</p>
        </div>
        <div className="ins-tracks">
          <StreakBlock title="Learning streak" streak={habit.learning} tone="learning" />
          <StreakBlock title="Doing streak" streak={habit.doing} tone="doing" />
        </div>
      </section>

      {empty && <p className="ins-empty">Nothing recorded yet. Finish a task or write an entry and these numbers start moving. Every figure counts only what you actually did.</p>}

      <section aria-labelledby="vs-heading">
        <h2 id="vs-heading" className="ins-h2">
          You vs past you
        </h2>
        <p className="ins-sub">Each period is compared with the same stretch of the one before, so a Wednesday is matched against last Monday to Wednesday.</p>
        <div className="vs-grid">
          <VsCard title="Today vs yesterday" c={vs.day} />
          <VsCard title="This week vs last week" c={vs.week} />
          <VsCard title="This month vs last month" c={vs.month} />
        </div>
      </section>

      <div className="ins-two">
        <section className="panel" aria-labelledby="bests-heading">
          <h2 id="bests-heading" className="panel__title">
            Personal bests
          </h2>
          <dl className="bests">
            <div>
              <dt>Best day</dt>
              <dd>{bests.bestDay ? `${bests.bestDay.points} points · ${formatMedium(bests.bestDay.date)}` : 'Not yet'}</dd>
            </div>
            <div>
              <dt>Best week</dt>
              <dd>{bests.bestWeek ? `${bests.bestWeek.completed} tasks · week of ${formatShort(bests.bestWeek.start)}` : 'Not yet'}</dd>
            </div>
            <div>
              <dt>Longest streak</dt>
              <dd>
                {bests.longestStreak} day{bests.longestStreak === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt>All time</dt>
              <dd>
                {bests.totalCompleted} tasks done · {bests.totalDocumented} documented entries
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="m30-heading">
          <h2 id="m30-heading" className="panel__title">
            Last 30 days
          </h2>
          <p className="panel__sub">
            {formatShort(last30.range.start)} – {formatShort(last30.range.end)} · {last30.activeDays} active days
          </p>
          <dl className="m30">
            <Metric label="Tasks done" value={String(last30.completed)} def={`${last30.completedLearning} learning, ${last30.completedDoing} doing`} />
            <Metric label="Finished as planned" value={pct(last30.completionRate)} def={last30.scheduled ? `${last30.scheduledDone} of ${last30.scheduled} scheduled, canceled excluded` : 'Nothing scheduled yet'} />
            <Metric label="Journal entries" value={String(last30.entries)} def={`${last30.documented} marked documented`} />
            <Metric label="Goal logs" value={String(last30.goalLogs)} def="Progress updates and check-ins" />
          </dl>
        </section>
      </div>

      <section className="panel" aria-labelledby="trend-heading">
        <div className="panel__head">
          <div>
            <h2 id="trend-heading" className="panel__title">
              12-week trend
            </h2>
            <p className="panel__sub">Points per week: 1 per finished task, entry, or goal log.</p>
          </div>
        </div>
        <TrendBars weeks={trend} today={today} weekStart={weekStart} />
      </section>

      <section className="panel" aria-labelledby="heat-heading">
        <h2 id="heat-heading" className="panel__title">
          Last 6 months
        </h2>
        <Heat source={source} today={today} weekStart={weekStart} />
      </section>

      <section className="panel" aria-labelledby="goals-heading">
        <div className="panel__head">
          <div>
            <h2 id="goals-heading" className="panel__title">
              Goals
            </h2>
            <p className="panel__sub">Behind first. Pace compares progress with time passed in the plan.</p>
          </div>
          <Link to="/visions" className="btn btn--quiet btn--sm">
            Visions
          </Link>
        </div>
        {goals.length === 0 ? (
          <p className="panel__empty">No active goals yet.</p>
        ) : (
          <ul className="ins-goals">
            {goals.map((g) => (
              <li key={g.goal.id}>
                <Link to={`/goals/${g.goal.id}`} className="ins-goal">
                  <span className="ins-goal__title">{g.goal.title}</span>
                  <span className="ins-goal__pct tabular">{g.progress.fraction === null ? '—' : `${Math.round(g.progress.fraction * 100)}%`}</span>
                  <PaceChip state={g.pace.state} label={g.pace.label} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StreakBlock({ title, streak, big, tone }: { title: string; streak: Streak; big?: boolean; tone?: 'learning' | 'doing' }) {
  return (
    <div className={`ins-streak ${big ? 'ins-streak--big' : ''} ${tone ? `ins-streak--${tone}` : ''} ${streak.current > 0 ? 'is-lit' : ''}`}>
      <p className="ins-label">{title}</p>
      <p className="ins-big tabular">
        <Icon name="flame" size={big ? 30 : 18} />
        {streak.current}
        <span className="ins-big__of"> day{streak.current === 1 ? '' : 's'}</span>
      </p>
      <p className="ins-note">
        {streak.current > 0 && !streak.activeToday ? 'Do one thing today to keep it. ' : streak.activeToday ? 'Today counts. ' : ''}Best {streak.longest}
      </p>
    </div>
  );
}

function SevenDots({ source, today }: { source: ActivitySource; today: DateKey }) {
  const active = useMemo(() => qualifyingDays(source, today).combined, [source, today]);
  return (
    <div className="seven" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6);
        return (
          <span key={d} className={`seven__dot ${active.has(d) ? 'is-on' : ''} ${d === today ? 'is-today' : ''}`} title={formatShort(d)}>
            {formatKey(d, { weekday: 'narrow' })}
          </span>
        );
      })}
    </div>
  );
}

function Metric({ label, value, def }: { label: string; value: string; def: string }) {
  return (
    <div className="m30__item">
      <dt>{label}</dt>
      <dd className="m30__value tabular">{value}</dd>
      <dd className="m30__def">{def}</dd>
    </div>
  );
}

function VsCard({ title, c }: { title: string; c: ReturnType<typeof compareToDate> }) {
  const rows: [string, Delta][] = [
    ['Tasks done', c.completed],
    ['Entries', c.entries],
    ['Points', c.points],
    ['Active days', c.activeDays],
  ];
  const won = rows.filter(([, d]) => d.direction === 'up').length;
  const lost = rows.filter(([, d]) => d.direction === 'down').length;
  return (
    <div className={`vs ${won > lost ? 'vs--up' : lost > won ? 'vs--down' : ''}`}>
      <p className="vs__title">{title}</p>
      <p className="vs__verdict">{won > lost ? 'Ahead of past you' : lost > won ? 'Behind past you' : c.now.points + c.before.points === 0 ? 'No activity yet' : 'Even with past you'}</p>
      <table className="vs__table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Measure</span>
            </th>
            <th scope="col">Now</th>
            <th scope="col">Before</th>
            <th scope="col">
              <span className="visually-hidden">Change</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, d]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="tabular">{d.now}</td>
              <td className="tabular">{d.before}</td>
              <td className={`vs__delta vs__delta--${d.direction} tabular`}>{d.direction === 'same' ? '=' : `${d.direction === 'up' ? '▲' : '▼'} ${Math.abs(d.change)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendBars({ weeks, today, weekStart }: { weeks: ReturnType<typeof weeklyTrend>; today: DateKey; weekStart: WeekStart }) {
  const max = Math.max(1, ...weeks.map((w) => w.points));
  const current = startOfWeek(today, weekStart);
  return (
    <div className="trend" role="img" aria-label={`Points per week, oldest first: ${weeks.map((w) => w.points).join(', ')}`}>
      {weeks.map((w) => (
        <div key={w.start} className={`trend__col ${w.start === current ? 'is-current' : ''}`}>
          <span className="trend__val tabular">{w.points || ''}</span>
          <span className="trend__bar" style={{ height: `${(w.points / max) * 100}%` }} />
          <span className="trend__lbl">{formatShort(w.start).replace(/^(\w{3}) /, '$1 ')}</span>
        </div>
      ))}
    </div>
  );
}

function Heat({ source, today, weekStart }: { source: ActivitySource; today: DateKey; weekStart: WeekStart }) {
  const weeks = 26;
  const start = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1));
  const per = useMemo(
    () =>
      dayActivity({
        tasks: source.tasks.filter((t) => t.status === 'completed'),
        entries: source.entries.filter((e) => e.plainText.trim()),
        updates: source.updates,
      }),
    [source],
  );
  return (
    <div className="heat-wrap">
      <div className="heat" role="img" aria-label="Daily activity for the last six months, by level">
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="heat__col">
            {Array.from({ length: 7 }, (_, d) => {
              const key = addDays(start, w * 7 + d);
              const future = compareKeys(key, today) > 0;
              const lv: IntensityLevel = per.get(key)?.level ?? 0;
              return <span key={key} className={`heat__cell heat__cell--lv${lv} ${future ? 'is-future' : ''}`} title={future ? undefined : `${formatMedium(key)}: ${lv ? LEVEL_NAME[lv] : 'no activity'}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="heat__legend" aria-hidden="true">
        Less <span className="heat__cell heat__cell--lv0" /> <span className="heat__cell heat__cell--lv1" /> <span className="heat__cell heat__cell--lv2" /> <span className="heat__cell heat__cell--lv3" /> More
      </div>
    </div>
  );
}
