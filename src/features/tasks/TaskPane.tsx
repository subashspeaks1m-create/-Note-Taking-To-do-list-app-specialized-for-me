import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Art } from '../../components/art/Art';
import { TaskEmblem } from '../../components/art/TaskEmblem';
import { Icon } from '../../components/Icon';
import type { MenuItem } from '../../components/Menu';
import { useToast } from '../../components/Toasts';
import { addDays, formatShort, isDateKey, type DateKey } from '../../date/localDate';
import { TASK_TITLE_MAX, type Category } from '../../domain/config';
import type { ID, Task } from '../../domain/models';
import { normalizeTitle, sortTasks, type TaskSort } from '../../domain/tasks';
import { useCarryOverTasks, useGoalTitles, useTasksForDate } from '../../storage/queries';
import { useRepo } from '../../storage/StorageProvider';
import { requestPersistenceOnce } from '../../storage/persistence';
import type { DayRelation } from '../today/useSelectedDate';
import { BulkPasteDialog } from './BulkPasteDialog';
import { TaskEditor } from './TaskEditor';
import { TaskRow } from './TaskRow';
import { useTaskActions } from './useTaskActions';

type Filter = 'all' | Category;

interface Props {
  date: DateKey;
  today: DateKey;
  relation: DayRelation;
  timeZone: string;
  loggedTaskIds: Set<ID>;
  onWriteLog: (task: Task) => void;
  onCompleted: (task: Task) => void;
}

interface DragState {
  id: ID;
  startY: number;
  offset: number;
  pointerId: number;
}

/** Left side of the workbench: one-line tasks for the selected day. */
export function TaskPane({ date, today, relation, timeZone, loggedTaskIds, onWriteLog, onCompleted }: Props) {
  const repo = useRepo();
  const toast = useToast();
  const actions = useTaskActions(timeZone);
  const tasks = useTasksForDate(date);
  const carryOver = useCarryOverTasks(today);
  const goalTitles = useGoalTitles();
  const goalLabel = (t: Task) => {
    const titles = t.goalIds.map((id) => goalTitles?.get(id)).filter((x): x is string => !!x);
    return titles.length ? (titles.length > 1 ? `${titles[0]} +${titles.length - 1}` : titles[0]) : undefined;
  };
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<TaskSort>('manual');
  const [category, setCategory] = useState<Category>('learning');
  const [draft, setDraft] = useState('');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ task: Task | null; title?: string } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>(addDays(date, 1));
  const [carryOpen, setCarryOpen] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const inputId = useId();

  // Recurring tasks: make sure this day's occurrences exist (idempotent).
  useEffect(() => {
    repo.ensureOccurrences(date, today).catch(() => undefined);
  }, [repo, date, today]);

  const visible = useMemo(() => {
    const list = (tasks ?? []).filter((t) => filter === 'all' || t.category === filter);
    return sortTasks(list, sort);
  }, [tasks, filter, sort]);

  const counts = useMemo(() => {
    const all = tasks ?? [];
    const active = all.filter((t) => t.status !== 'canceled');
    return { total: active.length, done: active.filter((t) => t.status === 'completed').length };
  }, [tasks]);

  const reorderable = sort === 'manual' && filter === 'all' && !selecting;

  const addFromDraft = async () => {
    setCaptureError(null);
    let title: string;
    try {
      title = normalizeTitle(draft);
    } catch (e) {
      setCaptureError((e as Error).message);
      return;
    }
    try {
      await repo.addTask({ title, category, scheduledDate: date });
      setDraft('');
      setAnnouncement(`Added: ${title}`);
      void requestPersistenceOnce(repo);
    } catch (e) {
      // Keep the typed text so nothing is lost.
      setCaptureError(`Couldn't save this task. ${(e as Error).message || ''} Your text is still here; try again.`);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (/\r?\n/.test(text.trim())) {
      e.preventDefault();
      setBulkText(draft ? `${draft}\n${text}` : text);
    }
  };

  const toggle = useCallback(
    async (task: Task) => {
      const next = task.status === 'completed' ? 'todo' : 'completed';
      const after = await actions.setStatus(task, next);
      if (after && next === 'completed') {
        setAnnouncement(`Completed: ${task.title}`);
        onCompleted(after);
      }
    },
    [actions, onCompleted],
  );

  const menuItems = useCallback(
    (task: Task): (MenuItem | 'separator')[] => {
      const tomorrow = addDays(today, 1);
      return [
        { label: 'Edit details', onSelect: () => setEditing({ task }) },
        { label: 'Write what happened', onSelect: () => onWriteLog(task) },
        task.status === 'in-progress'
          ? { label: 'Mark not started', onSelect: () => void actions.setStatus(task, 'todo') }
          : { label: 'Mark in progress', onSelect: () => void actions.setStatus(task, 'in-progress'), disabled: task.status === 'completed' },
        'separator',
        { label: task.scheduledDate === today ? 'Move to tomorrow' : 'Move to today', onSelect: () => void actions.move([task.id], task.scheduledDate === today ? tomorrow : today) },
        { label: 'Move to another day…', onSelect: () => setEditing({ task }) },
        { label: 'Duplicate as new task', onSelect: () => void actions.duplicate(task) },
        'separator',
        task.status === 'canceled'
          ? { label: 'Restore task', onSelect: () => void actions.setStatus(task, 'todo') }
          : { label: 'Cancel task', onSelect: () => void actions.setStatus(task, 'canceled'), disabled: task.status === 'completed' },
        { label: 'Delete', tone: 'danger', onSelect: () => void actions.remove([task.id]) },
      ];
    },
    [actions, onWriteLog, today],
  );

  // ----- Reordering (pointer drag on the handle, or arrow keys on the focused handle) -----

  const commitReorder = useCallback(
    async (id: ID, targetIndex: number) => {
      const others = visible.filter((t) => t.id !== id);
      const clamped = Math.max(0, Math.min(others.length, targetIndex));
      const before = others[clamped - 1]?.rank ?? null;
      const after = others[clamped]?.rank ?? null;
      try {
        await repo.reorderTask(id, before, after);
        setAnnouncement(`Moved to position ${clamped + 1} of ${visible.length}`);
      } catch (e) {
        actions.fail(e);
      }
    },
    [visible, repo, actions],
  );

  const onHandlePointerDown = useCallback((e: PointerEvent<HTMLButtonElement>, task: Task) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: task.id, startY: e.clientY, offset: 0, pointerId: e.pointerId });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      setDrag((d) => (d ? { ...d, offset: e.clientY - d.startY } : d));
    };
    const up = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? [])];
      const others = rows.filter((r) => r.dataset.taskId !== drag.id);
      const y = e.clientY;
      let index = others.findIndex((r) => {
        const rect = r.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      if (index === -1) index = others.length;
      const from = visible.findIndex((t) => t.id === drag.id);
      setDrag(null);
      if (Math.abs(e.clientY - drag.startY) > 4 && index !== from) void commitReorder(drag.id, index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, visible, commitReorder]);

  // Keep keyboard focus on the moved row's handle after a reorder re-renders the list.
  const focusAfterReorder = useRef<ID | null>(null);
  useEffect(() => {
    const id = focusAfterReorder.current;
    if (!id) return;
    listRef.current?.querySelector<HTMLButtonElement>(`[data-task-id="${id}"] .task__handle`)?.focus();
    focusAfterReorder.current = null;
  }, [visible]);

  const onHandleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, task: Task) => {
      const index = visible.findIndex((t) => t.id === task.id);
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        focusAfterReorder.current = task.id;
        void commitReorder(task.id, index - 1);
      } else if (e.key === 'ArrowDown' && index < visible.length - 1) {
        e.preventDefault();
        focusAfterReorder.current = task.id;
        void commitReorder(task.id, index + 1);
      }
    },
    [visible, commitReorder],
  );

  const onSelectRow = useCallback((task: Task, on: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(task.id);
      else n.delete(task.id);
      return n;
    });
  }, []);

  const openEditor = useCallback((task: Task) => setEditing({ task }), []);

  const selectedIds = [...selected].filter((id) => visible.some((t) => t.id === id));
  const showCarry = relation === 'today' && (carryOver?.length ?? 0) > 0;

  return (
    <section className="pane pane--tasks" aria-labelledby="tasks-heading">
      <header className="pane__head">
        <div className="pane__title-row">
          <TaskEmblem done={counts.done} total={counts.total} />
          <h2 id="tasks-heading" className="pane__title">
            What I'll do
          </h2>
        </div>
        {counts.total > 0 && counts.done === counts.total ? (
          <span className="pane__meta all-clear art-host">
            <Art name="party-popper" size={22} motion="pop" />
            All clear · {counts.total} / {counts.total}
          </span>
        ) : (
          <span className="pane__meta tabular">{counts.total === 0 ? 'No tasks' : `${counts.done} / ${counts.total} complete`}</span>
        )}
      </header>

      <form
        className="capture"
        onSubmit={(e) => {
          e.preventDefault();
          void addFromDraft();
        }}
      >
        <div className="capture__row">
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
          <button type="button" className="link-btn link-btn--quiet capture__more" onClick={() => setEditing({ task: null, title: draft })}>
            More options
          </button>
        </div>
        <label htmlFor={inputId} className="visually-hidden">
          New {category === 'learning' ? 'Learning' : 'Doing'} task for {formatShort(date)}
        </label>
        <div className={`capture__field capture__field--${category}`}>
          <Icon name="plus" size={18} className="capture__plus" />
          <input
            id={inputId}
            type="text"
            value={draft}
            maxLength={TASK_TITLE_MAX * 4}
            placeholder={relation === 'future' ? 'Plan a one-line task…' : 'Add a one-line task…'}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={!!captureError}
            aria-describedby={captureError ? `${inputId}-err` : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (captureError) setCaptureError(null);
            }}
            onPaste={onPaste}
          />
          {draft.length > TASK_TITLE_MAX - 20 && (
            <span className={`capture__count ${draft.trim().length > TASK_TITLE_MAX ? 'is-over' : ''}`} aria-hidden="true">
              {draft.trim().length}/{TASK_TITLE_MAX}
            </span>
          )}
        </div>
        {captureError && (
          <p id={`${inputId}-err`} className="form-error" role="alert">
            {captureError}
          </p>
        )}
      </form>

      <div className="pane__toolbar">
        <div className="segmented" role="group" aria-label="Filter tasks by category">
          {(['all', 'learning', 'doing'] as const).map((f) => (
            <button key={f} type="button" className={`segmented__btn segmented__btn--${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'learning' ? 'Learning' : 'Doing'}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="sort">
            <span className="visually-hidden">Sort tasks</span>
            <select id="task-sort" className="input input--sm" value={sort} onChange={(e) => setSort(e.target.value as TaskSort)}>
              <option value="manual">My order</option>
              <option value="priority">Priority</option>
              <option value="time">Scheduled time</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((v) => !v);
              setSelected(new Set());
            }}
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        </div>
      </div>

      {selecting && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span className="tabular">{selectedIds.length} selected</span>
          <div className="bulk-bar__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setSelected(new Set(visible.map((t) => t.id)))}>
              All
            </button>
            <label className="visually-hidden" htmlFor="bulk-move-date">
              Move selected to day
            </label>
            <input id="bulk-move-date" className="input input--sm" type="date" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} />
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              disabled={!selectedIds.length || !isDateKey(moveTarget)}
              onClick={async () => {
                await actions.move(selectedIds, moveTarget as DateKey, 'bulk-move');
                setSelected(new Set());
              }}
            >
              Move
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--sm btn--danger"
              disabled={!selectedIds.length}
              onClick={async () => {
                await actions.remove(selectedIds);
                setSelected(new Set());
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="pane__scroll pane__scroll--tasks">
        {showCarry && (
          <section className="carry" aria-labelledby="carry-heading">
            <div className="carry__head">
              <button type="button" className="carry__toggle" aria-expanded={carryOpen} onClick={() => setCarryOpen((v) => !v)}>
                <Icon name={carryOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                <span id="carry-heading">Still open from earlier</span>
                <span className="carry__count tabular">{carryOver!.length}</span>
              </button>
              <button type="button" className="link-btn link-btn--quiet" onClick={() => void actions.move(carryOver!.map((t) => t.id), today, 'carry-over')}>
                Move all to today
              </button>
            </div>
            {carryOpen && (
              <ul className="task-list task-list--carry">
                {carryOver!.map((t) => (
                  <TaskRow key={t.id} task={t} showOrigin onToggle={toggle} onOpen={openEditor} onWriteLog={onWriteLog} menuItems={menuItems} hasLog={loggedTaskIds.has(t.id)} goalLabel={goalLabel(t)} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tasks === undefined ? (
          <div className="skeleton-list" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : visible.length === 0 ? (
          <div className="empty empty--tasks">
            <div className="empty__art" aria-hidden="true">
              <Icon name="check" size={26} />
            </div>
            {tasks.length > 0 ? (
              <>
                <p className="empty__title">No {filter === 'learning' ? 'Learning' : 'Doing'} tasks on this day.</p>
                <button type="button" className="link-btn" onClick={() => setFilter('all')}>
                  Show all tasks
                </button>
              </>
            ) : (
              <>
                <p className="empty__title">{relation === 'future' ? 'Plan what you will learn or do.' : relation === 'past' ? 'No tasks were planned for this day.' : 'What will you learn or do today?'}</p>
                <p className="empty__body">Keep each task to one line. Write the full story on the right after you do it. Paste several lines to add them all at once.</p>
              </>
            )}
          </div>
        ) : (
          <ul ref={listRef} className={`task-list ${drag ? 'is-dragging' : ''}`} aria-label={`Tasks for ${formatShort(date)}`}>
            {visible.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                reorderable={reorderable}
                dragging={drag?.id === t.id}
                dragOffset={drag?.id === t.id ? drag.offset : 0}
                selectable={selecting}
                selected={selected.has(t.id)}
                onSelect={onSelectRow}
                onToggle={toggle}
                onOpen={openEditor}
                onWriteLog={onWriteLog}
                menuItems={menuItems}
                onHandlePointerDown={onHandlePointerDown}
                onHandleKeyDown={onHandleKeyDown}
                hasLog={loggedTaskIds.has(t.id)}
                goalLabel={goalLabel(t)}
              />
            ))}
          </ul>
        )}
        {!reorderable && visible.length > 1 && !selecting && <p className="pane__hint">Choose “My order” and All to drag tasks into a new order.</p>}
      </div>

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>

      {bulkText !== null && (
        <BulkPasteDialog
          text={bulkText}
          defaultCategory={category}
          defaultDate={date}
          onCancel={() => setBulkText(null)}
          onConfirm={async (titles, cat, day) => {
            await repo.addTasks(titles, cat, day);
            setBulkText(null);
            setDraft('');
            toast({ message: `${titles.length} ${titles.length === 1 ? 'task' : 'tasks'} added${day !== date ? ` to ${formatShort(day)}` : ''}`, tone: 'success' });
            void requestPersistenceOnce(repo);
          }}
        />
      )}
      {editing && (
        <TaskEditor
          task={editing.task}
          initialTitle={editing.title}
          defaultDate={date}
          defaultCategory={category}
          timeZone={timeZone}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            toast({ message, tone: 'success' });
            if (!editing.task) setDraft('');
          }}
        />
      )}
    </section>
  );
}
