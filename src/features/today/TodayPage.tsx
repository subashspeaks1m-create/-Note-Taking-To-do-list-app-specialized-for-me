import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useDisplayPrefs, useIsMobile, useMediaQuery } from '../../app/displayPrefs';
import { Icon } from '../../components/Icon';
import { JournalPane } from '../journal/JournalPane';
import { TaskPane } from '../tasks/TaskPane';
import { DateControl } from './DateControl';
import { DirectionColumn } from './DirectionColumn';
import { ProfileStrip } from './ProfileStrip';
import { useSelectedDate } from './useSelectedDate';

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.6;

export function TodayPage() {
  const { today, selected, relation, select, timeZone } = useSelectedDate();
  const { prefs, setPref } = useDisplayPrefs();
  const isMobile = useIsMobile();
  const wideEnoughForDirection = useMediaQuery('(min-width: 1200px)');
  const [mobileTab, setMobileTab] = useState<'tasks' | 'log'>('tasks');
  const [directionOpen, setDirectionOpen] = useState(false);

  return (
    <div className={`today ${wideEnoughForDirection ? 'today--with-direction' : ''}`}>
      {wideEnoughForDirection && <DirectionColumn selected={selected} today={today} />}

      <div className="today__main">
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
                Tasks <span className="tabs__count tabular">0</span>
              </button>
              <button type="button" role="tab" id="tab-log" aria-selected={mobileTab === 'log'} aria-controls="panel-log" className="tabs__tab" onClick={() => setMobileTab('log')}>
                Log <span className="tabs__count tabular">0</span>
              </button>
            </div>
            <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" hidden={mobileTab !== 'tasks'}>
              <TaskPane relation={relation} />
            </div>
            <div id="panel-log" role="tabpanel" aria-labelledby="tab-log" hidden={mobileTab !== 'log'}>
              <JournalPane selected={selected} />
            </div>
          </div>
        ) : (
          <Workbench
            ratio={prefs.splitRatio}
            onRatio={(r) => setPref('splitRatio', r)}
            left={<TaskPane relation={relation} />}
            right={<JournalPane selected={selected} />}
          />
        )}
      </div>
    </div>
  );
}

interface WorkbenchProps {
  ratio: number;
  onRatio: (ratio: number) => void;
  left: React.ReactNode;
  right: React.ReactNode;
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
