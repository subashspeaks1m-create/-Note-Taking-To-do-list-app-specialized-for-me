import { useState, type FormEvent } from 'react';
import { Art } from '../../components/art/Art';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import type { Principle } from '../../domain/models';
import { usePrinciples } from '../../storage/queries';
import { useRepo } from '../../storage/StorageProvider';

/**
 * The rules Prem lives by. The first one is the topmost principle, the one
 * followed every single time; it also shows on Today.
 */
export function PrinciplesPage() {
  const principles = usePrinciples();
  const [editing, setEditing] = useState<string | null>(null);
  if (!principles) return <div className="page page--narrow" />;
  const [top, ...rest] = principles;

  return (
    <div className="page page--narrow page--principles">
      <PageHeader overline="What I live by" title="Principles" art="glowing-star" artMotion="spin" />

      {!top ? (
        <section className="principle-hero principle-hero--empty">
          <p className="overline">Your number one</p>
          <p className="principle-hero__lead">What is the one principle you follow every single time, no matter what?</p>
          <PrincipleForm top submitLabel="Set as my #1" placeholder="e.g. Do the hard thing first." />
        </section>
      ) : editing === top.id ? (
        <section className="principle-hero">
          <PrincipleForm initial={top} submitLabel="Save" onDone={() => setEditing(null)} />
        </section>
      ) : (
        <section className="principle-hero art-host" aria-labelledby="top-principle">
          <div className="principle-hero__head">
            <Art name="crown" size={34} motion="bounce" />
            <p className="overline">Number one · every single time</p>
            <button type="button" className="icon-btn icon-btn--sm principle-hero__edit" aria-label="Edit your number one principle" onClick={() => setEditing(top.id)}>
              <Icon name="pen" size={16} />
            </button>
          </div>
          <blockquote id="top-principle" className="principle-hero__text">
            {top.text}
          </blockquote>
          {top.why && <p className="principle-hero__why">{top.why}</p>}
        </section>
      )}

      {top && (
        <>
          <h2 className="section-title">The rest, in order</h2>
          {rest.length === 0 ? (
            <p className="section-sub">Add the other rules you live by. Use “Make #1” on any of them to put it on top.</p>
          ) : (
            <ol className="principles">
              {rest.map((p, i) =>
                editing === p.id ? (
                  <li key={p.id} className="principle principle--editing">
                    <PrincipleForm initial={p} submitLabel="Save" onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <PrincipleRow key={p.id} principle={p} index={i + 1} last={i === rest.length - 1} onEdit={() => setEditing(p.id)} />
                ),
              )}
            </ol>
          )}
          <section className="panel principles__add" aria-labelledby="add-principle">
            <h2 id="add-principle" className="panel__title">
              Add a principle
            </h2>
            <PrincipleForm submitLabel="Add principle" placeholder="e.g. Never miss twice." allowTop />
          </section>
        </>
      )}
    </div>
  );
}

function PrincipleRow({ principle, index, last, onEdit }: { principle: Principle; index: number; last: boolean; onEdit: () => void }) {
  const repo = useRepo();
  const toast = useToast();
  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: 'error' });

  const remove = async () => {
    try {
      const removed = await repo.deletePrinciple(principle.id);
      if (removed) toast({ message: 'Principle deleted', action: { label: 'Undo', run: () => repo.restorePrinciple(removed.principle, removed.index) } });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <li className="principle">
      <span className="principle__num tabular" aria-hidden="true">
        {index + 1}
      </span>
      <div className="principle__body">
        <p className="principle__text">{principle.text}</p>
        {principle.why && <p className="principle__why">{principle.why}</p>}
      </div>
      <div className="principle__actions">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => repo.movePrinciple(principle.id, 0).catch(fail)}>
          Make #1
        </button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move “${principle.text}” up`} onClick={() => repo.movePrinciple(principle.id, index - 1).catch(fail)}>
          <Icon name="chevronUp" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move “${principle.text}” down`} disabled={last} onClick={() => repo.movePrinciple(principle.id, index + 1).catch(fail)}>
          <Icon name="chevronDown" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit “${principle.text}”`} onClick={onEdit}>
          <Icon name="pen" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Delete “${principle.text}”`} onClick={() => void remove()}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </li>
  );
}

function PrincipleForm({
  initial, top, allowTop, submitLabel, placeholder, onDone,
}: {
  initial?: Principle;
  top?: boolean;
  allowTop?: boolean;
  submitLabel: string;
  placeholder?: string;
  onDone?: () => void;
}) {
  const repo = useRepo();
  const toast = useToast();
  const [text, setText] = useState(initial?.text ?? '');
  const [why, setWhy] = useState(initial?.why ?? '');
  const [makeTop, setMakeTop] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (initial) await repo.updatePrinciple(initial.id, { text, why });
      else {
        await repo.addPrinciple({ text, why, top: top || makeTop });
        setText('');
        setWhy('');
        setMakeTop(false);
      }
      onDone?.();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="principle-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span className="field__label">Principle</span>
        <textarea className="input input--area principle-form__text" rows={2} maxLength={280} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field__label">
          Why it matters <span className="field__hint">optional</span>
        </span>
        <textarea className="input input--area" rows={2} maxLength={2000} value={why} placeholder="The reason, or the moment you learned it." onChange={(e) => setWhy(e.target.value)} />
      </label>
      <div className="principle-form__row">
        {allowTop && (
          <label className="check">
            <input type="checkbox" checked={makeTop} onChange={(e) => setMakeTop(e.target.checked)} /> Make this my #1
          </label>
        )}
        {onDone && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !text.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
