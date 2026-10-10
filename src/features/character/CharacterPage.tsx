import { Icon } from '../../components/Icon';
import { asset } from '../../app/asset';
import { LevelRing, Meter } from '../../components/Progress';
import { PageHeader, StageNote } from '../../components/Page';
import { BADGES, SUITS, rankLabel, type SuitDefinition } from '../../domain/config';
import { useProgressSummary, type ProgressSummary } from '../../domain/progressSummary';
import { CharacterPortrait } from './CharacterPortrait';

function isUnlocked(suit: SuitDefinition, p: ProgressSummary): boolean {
  return p.learning.xp >= suit.minLearningXp && p.doing.xp >= suit.minDoingXp && p.global.xp >= suit.minGlobalXp;
}

function remainingText(suit: SuitDefinition, p: ProgressSummary): string {
  const parts: string[] = [];
  if (p.learning.xp < suit.minLearningXp) parts.push(`${suit.minLearningXp - p.learning.xp} Learning XP`);
  if (p.doing.xp < suit.minDoingXp) parts.push(`${suit.minDoingXp - p.doing.xp} Doing XP`);
  if (p.global.xp < suit.minGlobalXp) parts.push(`${suit.minGlobalXp - p.global.xp} total XP`);
  return parts.length ? `${parts.join(' and ')} to go` : 'Unlocked';
}

export function CharacterPage() {
  const p = useProgressSummary();
  const equipped = 'base';
  const next = SUITS.find((s) => !isUnlocked(s, p));

  return (
    <div className="page">
      <PageHeader overline="Character Chamber" title="Your character" />

      <section className="chamber" aria-label="Equipped character">
        <div className="chamber__stage">
          <img className="chamber__orbit" src={asset('/assets/ui/stage-base.svg')} alt="" aria-hidden="true" />
          <CharacterPortrait variant="chamber" />
          <span className="chamber__equipped">Initiate suit · equipped</span>
        </div>
        <div className="chamber__panel">
          <div className="chamber__level">
            <LevelRing fraction={p.global.fraction} level={p.global.level} size={84} label={`Level ${p.global.level}`} />
            <div>
              <p className="overline">Combined</p>
              <p className="chamber__rank">{rankLabel(p.global.level)}</p>
              <p className="chamber__xp tabular">
                {p.global.xp} / {p.global.nextLevelAt} XP to level {p.global.level + 1}
              </p>
            </div>
          </div>
          <Meter tone="learning" label={`Learning · Level ${p.learning.level}`} fraction={p.learning.fraction} valueText={`${p.learning.xp} XP`} />
          <Meter tone="doing" label={`Doing · Level ${p.doing.level}`} fraction={p.doing.fraction} valueText={`${p.doing.xp} XP`} />
          {next && (
            <div className="next-reward">
              <p className="overline">Next suit</p>
              <p className="next-reward__name">{next.name}</p>
              <p className="next-reward__req">
                {next.requirement} · {remainingText(next, p)}
              </p>
            </div>
          )}
          <p className="chamber__fine">Your character grows from recorded work only. Missing a day never removes anything you've earned.</p>
        </div>
      </section>

      <h2 className="section-title">Wardrobe</h2>
      <ul className="wardrobe">
        {SUITS.map((suit) => {
          const unlocked = isUnlocked(suit, p);
          return (
            <li key={suit.id} className={`suit suit--${suit.accent} ${unlocked ? '' : 'suit--locked'} ${equipped === suit.id ? 'suit--equipped' : ''}`}>
              <div className="suit__art">
                {suit.image ? (
                  <img src={suit.image} alt={`${suit.name} suit preview`} loading="lazy" decoding="async" />
                ) : (
                  <img src={asset('/assets/character/base-poster.webp')} alt="Initiate suit: the original hoodie portrait" loading="lazy" decoding="async" />
                )}
                {!unlocked && (
                  <span className="suit__lock">
                    <Icon name="lock" size={16} /> Locked
                  </span>
                )}
              </div>
              <div className="suit__body">
                <p className="suit__name">{suit.name}</p>
                <p className="suit__desc">{suit.description}</p>
                <p className="suit__req">{unlocked ? (equipped === suit.id ? 'Equipped' : 'Unlocked') : `${suit.requirement} · ${remainingText(suit, p)}`}</p>
                <button type="button" className="btn btn--quiet btn--sm" disabled={!unlocked || equipped === suit.id}>
                  {equipped === suit.id ? 'Equipped' : unlocked ? 'Equip' : 'Locked'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="section-title">Badges</h2>
      <ul className="badges">
        {BADGES.map((b) => (
          <li key={b.id} className="badge badge--locked">
            <img src={b.image} alt="" width={48} height={48} />
            <div>
              <p className="badge__name">{b.name}</p>
              <p className="badge__req">{b.requirement}</p>
            </div>
          </li>
        ))}
      </ul>

      <StageNote stage={5}>Earning XP, unlocking and equipping suits, badges and suit animation arrive in stage 5.</StageNote>
    </div>
  );
}
