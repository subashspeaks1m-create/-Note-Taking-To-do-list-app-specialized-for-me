import { memo, useMemo } from 'react';
import { Art } from '../../components/art/Art';
import { asset } from '../../app/asset';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { LevelRing, Meter } from '../../components/Progress';
import { useClock } from '../../date/clock';
import { minutesInZone, type DateKey } from '../../date/localDate';
import { PLAN_DEFAULTS, rankLabel } from '../../domain/config';
import { sprintCountdown } from '../../domain/plans';
import { useProgressSummary } from '../../domain/progressSummary';
import { consistency } from '../../domain/stats';
import { useActivitySource } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';
import { CharacterPortrait } from '../character/CharacterPortrait';

interface Props {
  today: DateKey;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  timeZone: string;
}

function greetingFor(minutes: number): string {
  if (minutes < 5 * 60) return 'Still up';
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}

const sprint = PLAN_DEFAULTS.find((p) => p.kind === 'sprint')!;

/** The portrait is memoized separately so typing elsewhere never re-renders the video. */
const StripPortrait = memo(function StripPortrait() {
  return (
    <Link to="/character" className="strip__portrait" aria-label="Open Character Chamber">
      <img className="strip__orbit" src={asset('/assets/ui/stage-base.svg')} alt="" aria-hidden="true" />
      <CharacterPortrait variant="strip" />
    </Link>
  );
});

export function ProfileStrip({ today, collapsed, onToggleCollapsed, timeZone }: Props) {
  const clock = useClock();
  const progress = useProgressSummary();
  const countdown = sprintCountdown(today, sprint.startDate, sprint.endDate);
  const greeting = greetingFor(minutesInZone(clock.now(), timeZone));
  const { global, learning, doing } = progress;
  const profile = useProfile();
  const source = useActivitySource();
  const habit = useMemo(() => (source ? consistency(source, today, profile.weekStart ?? 'monday') : null), [source, today, profile.weekStart]);
  const streak = habit?.streak.current ?? 0;

  return (
    <section className={`strip ${collapsed ? 'strip--collapsed' : ''}`} aria-label="Your progress">
      <div className="strip__body">
        <div className="strip__intro">
          <p className="overline">A little progress, every day</p>
          <h1 className="strip__greeting">
            {greeting}, {profile.displayName}.
          </h1>
          {!collapsed && <p className="strip__sub">One clear intention. One real action. A written record of who you're becoming.</p>}
        </div>

        <div className="strip__stats">
          <div className="strip__level">
            <LevelRing
              fraction={global.fraction}
              level={global.level}
              size={collapsed ? 44 : 60}
              label={`Level ${global.level}, ${global.xp} of ${global.nextLevelAt} XP`}
            />
            <div>
              <div className="strip__rank">
                {rankLabel(global.level)} · Level {global.level}
              </div>
              <div className="strip__xp tabular">
                {global.xp} / {global.nextLevelAt} XP
              </div>
            </div>
          </div>
          {!collapsed && (
            <div className="strip__meters">
              <Meter tone="learning" label="Learning" fraction={learning.fraction} valueText={`Lv ${learning.level} · ${learning.xp} XP`} />
              <Meter tone="doing" label="Doing" fraction={doing.fraction} valueText={`Lv ${doing.level} · ${doing.xp} XP`} />
            </div>
          )}
          <div className="strip__chips">
            <Link
              to="/insights"
              className={`chip art-host ${streak > 0 ? 'chip--streak' : 'chip--quiet'}`}
              title={`Days in a row with a completed task or documented entry.${habit && streak > 0 && !habit.streak.activeToday ? ' Do one today to keep it going.' : ''}`}
            >
              {streak > 0 ? <Art name="fire" size={18} motion="flicker" /> : <Icon name="flame" size={16} />}
              <span className="tabular">{streak}</span>
              <span>day streak</span>
              {habit && (
                <span className="chip__extra tabular" aria-label={`${habit.last7} of the last 7 days active`}>
                  · {habit.last7}/7
                </span>
              )}
            </Link>
            <Link to="/visions#sprint" className={`chip chip--gold art-host ${countdown.state === 'ended' ? 'chip--quiet' : ''}`}>
              <Art name="rocket" size={18} motion="float" />
              <span>{countdown.label}</span>
            </Link>
          </div>
        </div>
      </div>

      <StripPortrait />

      <button
        type="button"
        className="strip__toggle icon-btn icon-btn--sm"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand header' : 'Collapse header for focused work'}
        title={collapsed ? 'Expand header' : 'Focus mode: collapse header'}
      >
        <Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={18} />
      </button>
    </section>
  );
}
