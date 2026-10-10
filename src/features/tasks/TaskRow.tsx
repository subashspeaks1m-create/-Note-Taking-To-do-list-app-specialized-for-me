import { memo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, type MenuItem } from '../../components/Menu';
import { formatShort } from '../../date/localDate';
import type { Task } from '../../domain/models';
import { PRIORITY_LABEL } from '../../domain/tasks';

export interface TaskRowHandlers {
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onWriteLog: (task: Task) => void;
  menuItems: (task: Task) => (MenuItem | 'separator')[];
}

interface Props extends TaskRowHandlers {
  task: Task;
  /** Shown in carry-over lists: where the task came from. */
  showOrigin?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (task: Task, selected: boolean) => void;
  reorderable?: boolean;
  dragging?: boolean;
  dragOffset?: number;
  onHandlePointerDown?: (e: PointerEvent<HTMLButtonElement>, task: Task) => void;
  onHandleKeyDown?: (e: KeyboardEvent<HTMLButtonElement>, task: Task) => void;
  hasLog?: boolean;
  /** Title of the goal this task moves, when linked. */
  goalLabel?: string;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const TaskRow = memo(function TaskRow({
  task, showOrigin, selectable, selected, onSelect, reorderable, dragging, dragOffset = 0, onToggle, onOpen, onWriteLog,
  menuItems, onHandlePointerDown, onHandleKeyDown, hasLog, goalLabel,
}: Props) {
  const done = task.status === 'completed';
  const canceled = task.status === 'canceled';
  const moved = task.originalScheduledDate && task.scheduledDate && task.originalScheduledDate !== task.scheduledDate;
  // Bumped when the user checks the task off, to play one celebration burst.
  const [burst, setBurst] = useState(0);

  return (
    <li
      className={`task task--${task.category} task--${task.status} ${dragging ? 'task--dragging' : ''} ${selected ? 'task--selected' : ''}`}
      style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
      data-task-id={task.id}
    >
      {reorderable && (
        <button
          type="button"
          className="task__handle"
          aria-label={`Reorder ${task.title}. Use up and down arrow keys`}
          onPointerDown={(e) => onHandlePointerDown?.(e, task)}
          onKeyDown={(e) => onHandleKeyDown?.(e, task)}
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
      )}
      {selectable ? (
        <label className="task__check task__check--select">
          <input type="checkbox" checked={!!selected} onChange={(e) => onSelect?.(task, e.target.checked)} aria-label={`Select ${task.title}`} />
          <span className="task__box" aria-hidden="true">
            {selected && <Icon name="check" size={14} />}
          </span>
        </label>
      ) : (
        <label className="task__check">
          <input
            type="checkbox"
            checked={done}
            disabled={canceled}
            onChange={() => {
              if (!done) setBurst((n) => n + 1);
              onToggle(task);
            }}
            aria-label={`${done ? 'Mark not done' : 'Complete'}: ${task.title}`}
          />
          <span key={`box-${burst}`} className={`task__box ${burst > 0 && done ? 'task__box--pop' : ''}`} aria-hidden="true">
            {done && <Icon name="check" size={14} />}
          </span>
          {burst > 0 && done && <Burst key={`burst-${burst}`} tone={task.category} />}
        </label>
      )}

      <div className="task__main">
        <button type="button" className="task__title" onClick={() => onOpen(task)}>
          {task.title}
        </button>
        <div className="task__meta">
          <span className={`task__cat task__cat--${task.category}`}>
            <span aria-hidden="true">{task.category === 'learning' ? '◆' : '▲'}</span>
            {task.category === 'learning' ? 'Learning' : 'Doing'}
          </span>
          {task.status === 'in-progress' && <span className="task__chip task__chip--progress">In progress</span>}
          {canceled && <span className="task__chip">Canceled</span>}
          {task.dueTime && <span className="task__chip">{formatTime(task.dueTime)}</span>}
          {task.effort !== 'standard' && <span className="task__chip">{task.effort === 'small' ? 'Small' : 'Deep'}</span>}
          {task.priority > 0 && <span className={`task__chip task__chip--p${task.priority}`}>{PRIORITY_LABEL[task.priority]} priority</span>}
          {task.estimatedMinutes && <span className="task__chip">{task.estimatedMinutes} min</span>}
          {task.seriesId && (
            <span className="task__chip" title="Repeating task">
              ↻ {goalLabel ? 'Habit' : 'Repeats'}
            </span>
          )}
          {goalLabel && (
            <span className="task__chip task__chip--goal" title={`Moves: ${goalLabel}`}>
              ◎ {goalLabel}
            </span>
          )}
          {showOrigin && <span className="task__chip task__chip--origin">{task.scheduledDate ? `From ${formatShort(task.scheduledDate)}` : 'Unscheduled'}</span>}
          {!showOrigin && moved && <span className="task__chip">Moved from {formatShort(task.originalScheduledDate!)}</span>}
          {hasLog && <span className="task__chip task__chip--log">Logged</span>}
        </div>
        {done && !hasLog && (
          <button type="button" className="task__write" onClick={() => onWriteLog(task)}>
            <Icon name="pen" size={14} /> Write what happened
          </button>
        )}
      </div>

      <Menu label={`Actions for ${task.title}`} trigger={<Icon name="more" size={18} />} items={menuItems(task)} className="task__menu" />
    </li>
  );
});

const BITS = Array.from({ length: 10 }, (_, i) => i);

/** Confetti, a ring and "+1" thrown from the checkbox when a task is finished. */
function Burst({ tone }: { tone: Task['category'] }) {
  const colors = tone === 'learning' ? ['var(--learning)', 'var(--gold)', '#fff'] : ['var(--doing)', 'var(--gold)', '#fff'];
  return (
    <span className="burst" aria-hidden="true">
      <span className="burst__ring" />
      {BITS.map((i) => (
        <span key={i} className="burst__bit" style={{ '--a': `${i * 36 + (i % 2) * 12}deg`, '--c': colors[i % 3] } as CSSProperties} />
      ))}
      <span className="burst__plus">+1</span>
    </span>
  );
}
