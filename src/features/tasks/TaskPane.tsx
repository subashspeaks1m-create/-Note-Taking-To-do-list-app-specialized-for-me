import { useId, useState } from 'react';
import { Icon } from '../../components/Icon';
import { TASK_TITLE_MAX, type Category } from '../../domain/config';
import type { DayRelation } from '../today/useSelectedDate';

type Filter = 'all' | Category;

interface Props {
  relation: DayRelation;
}

/**
 * Left side of the workbench: one-line tasks. Stage 1 renders the real
 * layout, filters and capture row in their empty state; saving arrives in stage 2.
 */
export function TaskPane({ relation }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<Category>('learning');
  const inputId = useId();

  return (
    <section className="pane pane--tasks" aria-labelledby="tasks-heading">
      <header className="pane__head">
        <h2 id="tasks-heading" className="pane__title">
          What I'll do
        </h2>
        <span className="pane__meta tabular">0 tasks</span>
      </header>

      <form className="capture" onSubmit={(e) => e.preventDefault()} aria-describedby={`${inputId}-hint`}>
        <div className="capture__cat" role="group" aria-label="Category for the new task">
          <button type="button" aria-pressed={category === 'learning'} className="capture__cat-btn capture__cat-btn--learning" onClick={() => setCategory('learning')}>
            <Icon name="learning" size={16} />
            <span>Learn</span>
          </button>
          <button type="button" aria-pressed={category === 'doing'} className="capture__cat-btn capture__cat-btn--doing" onClick={() => setCategory('doing')}>
            <Icon name="doing" size={16} />
            <span>Do</span>
          </button>
        </div>
        <label htmlFor={inputId} className="visually-hidden">
          New task
        </label>
        <div className="capture__field">
          <Icon name="plus" size={18} className="capture__plus" />
          <input id={inputId} type="text" maxLength={TASK_TITLE_MAX} placeholder="Add a one-line task…" autoComplete="off" disabled />
        </div>
        <p id={`${inputId}-hint`} className="capture__hint">
          Task saving starts in stage 2.
        </p>
      </form>

      <div className="pane__toolbar">
        <div className="segmented" role="group" aria-label="Filter tasks by category">
          {(['all', 'learning', 'doing'] as const).map((f) => (
            <button key={f} type="button" className={`segmented__btn segmented__btn--${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'learning' ? 'Learning' : 'Doing'}
            </button>
          ))}
        </div>
      </div>

      <div className="pane__scroll">
        <div className="empty empty--tasks">
          <div className="empty__art" aria-hidden="true">
            <Icon name="check" size={26} />
          </div>
          <p className="empty__title">{relation === 'future' ? 'Plan what you will learn or do.' : 'What will you learn or do today?'}</p>
          <p className="empty__body">Keep each task to one line. Write the full story on the right after you do it.</p>
        </div>
      </div>
    </section>
  );
}
