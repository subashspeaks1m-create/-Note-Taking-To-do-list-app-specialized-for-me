import { StaleNotice } from '../../components/StaleNotice';
import { useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { isDateKey, type DateKey } from '../../date/localDate';
import { DOMAIN_SUGGESTIONS, MEASUREMENT_LABEL, PLAN_KIND_LABEL, descendantIds } from '../../domain/goals';
import type { Goal, ID, MeasurementMode, VisionPlan } from '../../domain/models';
import { StaleEditError } from '../../storage/repo';
import { useRepo } from '../../storage/StorageProvider';

interface Props {
  goal: Goal | null;
  plans: VisionPlan[];
  goals: Goal[];
  defaultPlanId: ID | null;
  defaultParentId?: ID | null;
  today: DateKey;
  onClose: () => void;
  onSaved: (goal: Goal, created: boolean) => void;
}

const MODES: MeasurementMode[] = ['numeric', 'milestones', 'manual', 'tasks'];

const MODE_HELP: Record<MeasurementMode, string> = {
  numeric: 'Best for money, weight, books read: you log the number as it grows.',
  milestones: 'Break it into steps and tick them off.',
  manual: 'You decide the percent yourself when you check in.',
  tasks: 'Progress = linked tasks and habit days completed.',
};

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function GoalEditor({ goal, plans, goals, defaultPlanId, defaultParentId = null, today, onClose, onSaved }: Props) {
  const repo = useRepo();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [planId, setPlanId] = useState<ID | ''>(goal?.planId ?? defaultPlanId ?? '');
  const [parentId, setParentId] = useState<ID | ''>(goal?.parentId ?? defaultParentId ?? '');
  const [why, setWhy] = useState(goal?.why ?? '');
  const [category, setCategory] = useState<Goal['category']>(goal?.category ?? 'both');
  const [domain, setDomain] = useState(goal?.domain ?? '');
  const [mode, setMode] = useState<MeasurementMode>(goal?.measurementMode ?? 'numeric');
  const [target, setTarget] = useState(goal?.target?.toString() ?? '');
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [start, setStart] = useState('');
  const [reviewDate, setReviewDate] = useState(goal?.reviewDate ?? '');
  const [reward, setReward] = useState(goal?.sealedReward ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activePlans = plans.filter((p) => !p.archivedAt || p.id === goal?.planId);
  // A goal can't sit under itself or its own sub-goals.
  const parentOptions = useMemo(() => {
    const blocked = goal ? new Set([goal.id, ...descendantIds(goals, goal.id)]) : new Set<ID>();
    return goals.filter((g) => !blocked.has(g.id) && g.status !== 'archived');
  }, [goals, goal]);
  const modeChanged = goal !== null && goal.measurementMode !== mode;

  const [baseUpdatedAt, setBaseUpdatedAt] = useState(goal?.updatedAt);
  const [stale, setStale] = useState(false);

  const save = async () => {
    setError(null);
    const t = parseNumber(target);
    const s = parseNumber(start);
    if (mode === 'numeric' && (t === null || Number.isNaN(t) || t <= 0)) {
      setError('Enter the number you want to reach, above zero.');
      return;
    }
    if (Number.isNaN(s ?? 0)) {
      setError('The starting value should be a number.');
      return;
    }
    if (reviewDate && !isDateKey(reviewDate)) {
      setError('Choose a valid review date or leave it empty.');
      return;
    }
    const input = {
      title,
      planId: planId || null,
      parentId: parentId || null,
      why,
      category,
      domain,
      measurementMode: mode,
      target: mode === 'numeric' ? t : null,
      unit: mode === 'numeric' ? unit : '',
      reviewDate: reviewDate || null,
      notes,
      sealedReward: reward,
      ...(goal === null || modeChanged ? { current: mode === 'numeric' ? (s ?? 0) : mode === 'manual' ? s : null } : {}),
    };
    setBusy(true);
    try {
      const saved = goal ? await repo.updateGoal(goal.id, input, baseUpdatedAt) : await repo.createGoal(input, today);
      onSaved(saved, !goal);
      onClose();
    } catch (e) {
      if (e instanceof StaleEditError) setStale(true);
      else setError((e as Error).message || 'Could not save. Your changes are still here.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New goal'}
      description={goal ? undefined : 'Name the outcome, choose how to measure it, and add daily habits after.'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : goal ? 'Save goal' : 'Create goal'}
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field field--full">
          <span className="field__label">Goal</span>
          <input id="goal-title" className="input input--lg" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Make $1,000,000" autoFocus required />
        </label>

        <label className="field">
          <span className="field__label">Belongs to</span>
          <select id="goal-plan" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">No plan (standalone)</option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {PLAN_KIND_LABEL[p.kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">
            Supports a bigger goal <span className="field__hint">optional</span>
          </span>
          <select id="goal-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None</option>
            {parentOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field__label" id="goal-cat">
            Track
          </span>
          <div className="segmented" role="group" aria-labelledby="goal-cat">
            {(['learning', 'doing', 'both'] as const).map((c) => (
              <button key={c} type="button" className={`segmented__btn segmented__btn--${c === 'both' ? 'gold' : c}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
                {c === 'learning' ? 'Learning' : c === 'doing' ? 'Doing' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">
            Life area <span className="field__hint">optional</span>
          </span>
          <input id="goal-domain" className="input" list="goal-domains" value={domain} maxLength={40} onChange={(e) => setDomain(e.target.value)} placeholder="Work, Money, Health…" />
          <datalist id="goal-domains">
            {DOMAIN_SUGGESTIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>

        <div className="field field--full">
          <span className="field__label" id="goal-mode">
            How will you measure it?
          </span>
          <div className="mode-picks" role="radiogroup" aria-labelledby="goal-mode">
            {MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className="mode-pick" onClick={() => setMode(m)}>
                <span className="mode-pick__name">{MEASUREMENT_LABEL[m]}</span>
                <span className="mode-pick__help">{MODE_HELP[m]}</span>
              </button>
            ))}
          </div>
          {modeChanged && <span className="field__note">Switching the measure starts it fresh. Your earlier check-ins stay in the history.</span>}
        </div>

        {mode === 'numeric' && (
          <>
            <label className="field">
              <span className="field__label">Target</span>
              <input id="goal-target" className="input tabular" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1,000,000" />
            </label>
            <label className="field">
              <span className="field__label">
                Unit <span className="field__hint">$, ₹, km, books…</span>
              </span>
              <input id="goal-unit" className="input" value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} placeholder="$" />
            </label>
            {(goal === null || modeChanged) && (
              <label className="field">
                <span className="field__label">
                  Where you are now <span className="field__hint">optional</span>
                </span>
                <input id="goal-start" className="input tabular" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="0" />
              </label>
            )}
          </>
        )}
        {mode === 'manual' && (goal === null || modeChanged) && (
          <label className="field">
            <span className="field__label">
              Starting percent <span className="field__hint">optional</span>
            </span>
            <input id="goal-start" className="input tabular" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} placeholder="0" />
          </label>
        )}

        <label className="field field--full">
          <span className="field__label">
            Why it matters <span className="field__hint">read this on hard days</span>
          </span>
          <textarea id="goal-why" className="input input--area" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">
            Review on <span className="field__hint">optional</span>
          </span>
          <input id="goal-review" className="input" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">
            Sealed reward <span className="field__hint">hidden until you achieve it</span>
          </span>
          <input id="goal-reward" className="input" type="password" autoComplete="off" value={reward} maxLength={200} onChange={(e) => setReward(e.target.value)} placeholder="A real-life treat you promise yourself" />
        </label>

        <label className="field field--full">
          <span className="field__label">Notes</span>
          <textarea id="goal-notes" className="input input--area" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <StaleNotice
          what="goal"
          onKeepTheirs={onClose}
          onKeepMine={() => {
            setStale(false);
            setBaseUpdatedAt(undefined);
          }}
        />
      )}
    </Dialog>
  );
}
