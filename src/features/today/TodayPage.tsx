import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useDisplayPrefs, useIsMobile, useMediaQuery } from '../../app/displayPrefs';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { formatLong, type DateKey } from '../../date/localDate';
import type { EntryKind, ID, JournalEntry, Task } from '../../domain/models';
import { useEntriesForDate, useTasksByIds, useTasksForDate } from '../../storage/queries';
import { useRepo, useStorage } from '../../storage/StorageProvider';
import { JournalPane } from '../journal/JournalPane';
import { readDraft } from '../journal/useEntryAutosave';
import { TaskPane } from '../tasks/TaskPane';
import { DateControl } from './DateControl';
import { DirectionColumn } from './DirectionColumn';
import { ProfileStrip } from './ProfileStrip';
import { useSelectedDate } from './useSelectedDate';

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.6;

export function TodayPage() {
  const { today, selected, relation, select, timeZone, explicit } = useSelectedDate();
  const { prefs, setPref } = useDisplayPrefs();
  const repo = useRepo();
  const { db } = useStorage();
  const toast = useToast();
  const isMobile = useIsMobile();
  const wideEnoughForDirection = useMediaQuery('(min-width: 1200px)');
  const [mobileTab, setMobileTab] = useState<'tasks' | 'log'>('tasks');
  const [directionOpen, setDirectionOpen] = useState(false);
  // The open entry belongs to one date; switching days closes it (its editor saves on the way out).
  const [active, setActive] = useState<{ date: DateKey; id: ID } | null>(null);
  const [justCompleted, setJustCompleted] = useState<Task | null>(null);
  const [newDay, setNewDay] = useState<DateKey | null>(null);
  const activeEntryId = active?.date === selected ? active.id : null;

  const tasks = useTasksForDate(selected);
  const entries = useEntriesForDate(selected);
  const linkedIds = useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.taskIds))], [entries]);
  const linkedTasks = useTasksByIds(linkedIds);
  const dayTasks = useMemo(() => {
    const map = new Map<ID, Task>();
    for (const t of tasks ?? []) map.set(t.id, t);
    for (const t of linkedTasks ?? []) if (!t.deletedAt) map.set(t.id, t);
    return [...map.values()];
  }, [tasks, linkedTasks]);

  // Which tasks already have a log anywhere (so rows can show "Logged").
  const taskIdsKey = (tasks ?? []).map((t) => t.id).join(',');
  const loggedTaskIds = useLiveQuery(
    async () => {
      const ids = taskIdsKey ? taskIdsKey.split(',') : [];
      if (!ids.length) return new Set<ID>();
      const rows = await db.entries.where('taskIds').anyOf(ids).toArray();
      return new Set(rows.filter((e) => !e.deletedAt && e.plainText.trim()).flatMap((e) => e.taskIds));
    },
    [db, taskIdsKey],
    new Set<ID>(),
  );

  // Midnight: if an entry is open on the old day, keep it there and offer the new day.
  const prevToday = useRef(today);
  useEffect(() => {
    const old = prevToday.current;
    if (old === today) return;
    prevToday.current = today;
    if (!explicit && active?.date === old) {
      select(old);
      setNewDay(today);
    }
  }, [today, explicit, active, select]);

  const discardIfEmpty = useCallback(
    (entry: JournalEntry | undefined) => {
      if (!entry || entry.plainText.trim() || entry.title.trim() || readDraft(entry.id)) return;
      void repo.discardEmptyEntry(entry.id);
    },
    [repo],
  );

  const activate = useCallback(
    (id: ID | null) => {
      const previous = entries?.find((e) => e.id === activeEntryId);
      if (previous && previous.id !== id) discardIfEmpty(previous);
      setActive(id ? { date: selected, id } : null);
    },
    [entries, activeEntryId, discardIfEmpty, selected],
  );

  const newEntry = useCallback(
    async (kind: EntryKind, taskIds: ID[] = []) => {
      try {
        const entry = await repo.createEntry({ dateKey: selected, kind, taskIds, timeZone });
        activate(entry.id);
        if (isMobile) setMobileTab('log');
      } catch (e) {
        toast({ message: `Couldn't start an entry. ${(e as Error).message}`, tone: 'error' });
      }
    },
    [repo, selected, timeZone, activate, isMobile, toast],
  );

  const writeLog = useCallback(
    (task: Task) => {
      setJustCompleted(null);
      const existing = entries?.find((e) => e.taskIds.includes(task.id));
      if (existing) {
        activate(existing.id);
        if (isMobile) setMobileTab('log');
      } else {
        void newEntry(task.category, [task.id]);
      }
    },
    [entries, activate, newEntry, isMobile],
  );

  const onCompleted = useCallback((task: Task) => setJustCompleted(task), []);

  const taskPane = (
    <TaskPane
      date={selected}
      today={today}
      relation={relation}
      timeZone={timeZone}
      loggedTaskIds={loggedTaskIds}
      onWriteLog={writeLog}
      onCompleted={onCompleted}
    />
  );
  const journalPane = (
    <JournalPane
      date={selected}
      relation={relation}
      timeZone={timeZone}
      entries={entries}
      dayTasks={dayTasks}
      activeEntryId={activeEntryId}
      onActivate={activate}
      onCloseEntry={(e) => {
        setActive(null);
        discardIfEmpty(e);
      }}
      onNewEntry={(kind) => void newEntry(kind)}
      justCompleted={justCompleted?.scheduledDate === selected || relation === 'today' ? justCompleted : null}
      onWriteLog={writeLog}
      onDismissCompleted={() => setJustCompleted(null)}
    />
  );

  const openTasks = (tasks ?? []).filter((t) => t.status === 'todo' || t.status === 'in-progress').length;

  return (
    <div className={`today ${wideEnoughForDirection ? 'today--with-direction' : ''}`}>
      {wideEnoughForDirection && <DirectionColumn selected={selected} today={today} />}

      <div className="today__main">
        {newDay && newDay !== selected && (
          <div className="notice notice--info" role="status">
            <span>It's a new day. Your open entry stays on {formatLong(selected)}.</span>
            <div className="notice__actions">
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                onClick={() => {
                  select(newDay);
                  setNewDay(null);
                }}
              >
                Go to {formatLong(newDay).replace(/, \d{4}$/, '')}
              </button>
            </div>
          </div>
        )}

        <div className="today__top">
          <DateControl selected={selected} today={today} relation={relation} onSelect={select} compact={isMobile} />
          {!wideEnoughForDirection && (
            <button type="button" className="btn btn--quiet direction-toggle" aria-expanded={directionOpen} aria-controls="direction-panel" onClick={() => setDirectionOpen((v) => !v)}>
              <Icon name="vision" size={18} />
              <span>Direction</span>
              <Icon name={directionOpen ? 'chevronUp' : 'chevronDown'} size={16} />
            </button>
          )}
        </div>

        {!wideEnoughForDirection && directionOpen && (
          <div id="direction-panel" className="direction-drawer">
            <DirectionColumn selected={selected} today={today} />
          </div>
        )}

        <ProfileStrip
          today={today}
          timeZone={timeZone}
          collapsed={prefs.headerCollapsed || isMobile}
          onToggleCollapsed={() => setPref('headerCollapsed', !prefs.headerCollapsed)}
        />

        {isMobile ? (
          <div className="mobile-workbench">
            <div className="tabs" role="tablist" aria-label="Today's work">
              <button type="button" role="tab" id="tab-tasks" aria-selected={mobileTab === 'tasks'} aria-controls="panel-tasks" className="tabs__tab" onClick={() => setMobileTab('tasks')}>
                Tasks <span className="tabs__count tabular" aria-label={`${openTasks} open`}>{openTasks}</span>
              </button>
              <button type="button" role="tab" id="tab-log" aria-selected={mobileTab === 'log'} aria-controls="panel-log" className="tabs__tab" onClick={() => setMobileTab('log')}>
                Log <span className="tabs__count tabular" aria-label={`${entries?.length ?? 0} entries`}>{entries?.length ?? 0}</span>
                {activeEntryId && <span className="tabs__dot" aria-label="Entry open" />}
              </button>
            </div>
            <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" hidden={mobileTab !== 'tasks'}>
              {taskPane}
            </div>
            <div id="panel-log" role="tabpanel" aria-labelledby="tab-log" hidden={mobileTab !== 'log'}>
              {journalPane}
            </div>
          </div>
        ) : (
          <Workbench ratio={prefs.splitRatio} onRatio={(r) => setPref('splitRatio', r)} left={taskPane} right={journalPane} />
        )}
      </div>
    </div>
  );
}

interface WorkbenchProps {
  ratio: number;
  onRatio: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
}

/** Two-pane workbench with a pointer- and keyboard-resizable divider. */
function Workbench({ ratio, onRatio, left, right }: WorkbenchProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(ratio);
  const dragging = useRef(false);
  const clamp = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

  const fromPointer = useCallback((clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    return clamp((clientX - rect.left) / rect.width);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const r = fromPointer(e.clientX);
    if (r !== null) setLive(r);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onRatio(live);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.05 : 0.02;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = live - step;
    if (e.key === 'ArrowRight') next = live + step;
    if (e.key === 'Home') next = MIN_RATIO;
    if (e.key === 'End') next = MAX_RATIO;
    if (e.key === 'Enter') next = 0.43;
    if (next === null) return;
    e.preventDefault();
    const r = clamp(next);
    setLive(r);
    onRatio(r);
  };

  return (
    <div ref={ref} className="workbench" style={{ gridTemplateColumns: `minmax(0, ${live}fr) var(--gutter) minmax(0, ${1 - live}fr)` }}>
      {left}
      <div
        className="workbench__divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tasks and log panes"
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-valuenow={Math.round(live * 100)}
        aria-valuetext={`Tasks ${Math.round(live * 100)} percent`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          setLive(0.43);
          onRatio(0.43);
        }}
      >
        <span className="workbench__grip" aria-hidden="true" />
      </div>
      {right}
    </div>
  );
}
