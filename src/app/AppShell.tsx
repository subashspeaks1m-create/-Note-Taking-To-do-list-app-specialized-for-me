import { UnlockWatcher } from '../features/character/UnlockReveal';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { Art } from '../components/art/Art';
import { BrandMark } from '../components/art/BrandMark';
import { LiveIcon } from '../components/art/LiveIcon';
import type { LiveIconName } from '../components/art/liveIcons';
import { Icon } from '../components/Icon';
import { APP_NAME } from '../domain/config';
import { formatShort } from '../date/localDate';
import { periodRange } from '../domain/stats';
import { useReportInbox, type ReportInbox } from '../features/insights/reportInbox';
import { useProfile } from '../storage/StorageProvider';
import { useDisplayPrefs } from './displayPrefs';

/** Which build stage this preview shows; the note reappears for each new stage. */
const PREVIEW_STAGE = 6;

interface Destination {
  to: string;
  label: string;
  icon: LiveIconName;
  mobilePrimary: boolean;
}

export const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Today', icon: 'today', mobilePrimary: true },
  { to: '/visions', label: 'Visions', icon: 'vision', mobilePrimary: true },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', mobilePrimary: true },
  { to: '/journal', label: 'Journal', icon: 'journal', mobilePrimary: true },
  { to: '/principles', label: 'Principles', icon: 'principles', mobilePrimary: false },
  { to: '/character', label: 'Character', icon: 'character', mobilePrimary: false },
  { to: '/insights', label: 'Insights', icon: 'insights', mobilePrimary: false },
  { to: '/settings', label: 'Settings', icon: 'settings', mobilePrimary: false },
];

export function AppShell() {
  const { prefs, setPref } = useDisplayPrefs();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const inbox = useReportInbox();

  // Move focus to the page on navigation so keyboard and screen-reader users land in the content.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className={`shell ${prefs.railCollapsed ? 'shell--rail-collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Rail inbox={inbox} />
      <main id="main" ref={mainRef} tabIndex={-1} className="shell__main">
        {prefs.stageBannerDismissed !== PREVIEW_STAGE && (
          <div className="stage-banner" role="note">
            <span className="stage-banner__tag">Stage {PREVIEW_STAGE} preview</span>
            <span>Stage 6: back up and restore your data in Settings, install the app, and use it offline. Two open tabs can no longer overwrite each other.</span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss preview note" onClick={() => setPref('stageBannerDismissed', PREVIEW_STAGE)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {!location.pathname.startsWith('/insights') && <ReportReady inbox={inbox} />}
        <Outlet />
        <UnlockWatcher />
      </main>
      <BottomBar inbox={inbox} />
    </div>
  );
}

/** "Your report is ready": shown on every page except Insights until opened or dismissed. */
function ReportReady({ inbox }: { inbox: ReportInbox }) {
  const profile = useProfile();
  const weekStart = profile.weekStart ?? 'monday';
  const item = inbox.week.isNew ? { kind: 'week' as const, ...inbox.week } : inbox.month.isNew ? { kind: 'month' as const, ...inbox.month } : null;
  if (!item) return null;
  const range = periodRange(item.kind, item.anchor, weekStart);
  const label =
    item.kind === 'week'
      ? `week of ${formatShort(range.start)} – ${formatShort(range.end)}`
      : new Date(`${range.start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return (
    <div className="report-ready art-host" role="status">
      <Art name="wrapped-gift" size={30} motion="shake" />
      <p className="report-ready__text">
        <strong>Your {item.kind === 'week' ? 'weekly' : 'monthly'} report is ready.</strong> Growth, daily activity and mistakes for the {label}.
      </p>
      <Link to={`/insights?tab=${item.kind}&p=${item.anchor}`} className="btn btn--primary btn--sm">
        Open report
      </Link>
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick={() => inbox.markSeen(item.key)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function Rail({ inbox }: { inbox: ReportInbox }) {
  const { prefs, setPref } = useDisplayPrefs();
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail__brand">
        <BrandMark size={36} />
        <span className="rail__wordmark">{APP_NAME}</span>
      </div>
      <ul className="rail__list">
        {DESTINATIONS.map((d) => (
          <li key={d.to}>
            <RailLink d={d} collapsed={prefs.railCollapsed} badge={d.to === '/insights' && inbox.unseen > 0} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="rail__toggle"
        aria-pressed={prefs.railCollapsed}
        onClick={() => setPref('railCollapsed', !prefs.railCollapsed)}
      >
        <Icon name="sidebar" size={18} />
        <span className="rail__label">{prefs.railCollapsed ? 'Expand menu' : 'Collapse menu'}</span>
        <span className="visually-hidden">{prefs.railCollapsed ? 'Expand navigation labels' : 'Collapse navigation labels'}</span>
      </button>
    </nav>
  );
}

/** Replays an icon's drawing on hover or focus, and whenever its route becomes active. */
function useReplay(d: Destination) {
  const [plays, setPlays] = useState(0);
  const active = !!useMatch({ path: d.to, end: d.to === '/' });
  return { play: `${plays}-${active}`, replay: () => setPlays((n) => n + 1) };
}

function RailLink({ d, collapsed, badge }: { d: Destination; collapsed: boolean; badge: boolean }) {
  const { play, replay } = useReplay(d);
  return (
    <NavLink to={d.to} end={d.to === '/'} className="rail__link" title={collapsed ? d.label : undefined} onMouseEnter={replay} onFocus={replay}>
      <span className="rail__icon">
        <LiveIcon name={d.icon} size={22} play={play} />
      </span>
      <span className="rail__label">{d.label}</span>
      {badge && <span className="nav-badge" aria-label="New report" />}
    </NavLink>
  );
}

function BottomLink({ d }: { d: Destination }) {
  const { play, replay } = useReplay(d);
  return (
    <NavLink to={d.to} end={d.to === '/'} className="bottom-bar__link" onMouseEnter={replay} onFocus={replay}>
      <LiveIcon name={d.icon} size={22} play={play} />
      <span>{d.label}</span>
    </NavLink>
  );
}

function BottomBar({ inbox }: { inbox: ReportInbox }) {
  const location = useLocation();
  // The sheet belongs to the route it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const setOpen = (value: boolean | ((v: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(open) : value;
    setOpenOn(next ? location.pathname : null);
  };
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const secondaryActive = DESTINATIONS.some((d) => !d.mobilePrimary && location.pathname.startsWith(d.to));

  useEffect(() => {
    if (!open) return;
    const first = sheetRef.current?.querySelector<HTMLElement>('a,button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenOn(null);
        moreRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <nav className="bottom-bar" aria-label="Main">
        {DESTINATIONS.filter((d) => d.mobilePrimary).map((d) => (
          <BottomLink key={d.to} d={d} />
        ))}
        <button
          ref={moreRef}
          type="button"
          className={`bottom-bar__link ${secondaryActive ? 'active' : ''}`}
          aria-expanded={open}
          aria-controls="more-sheet"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="more" size={22} />
          <span>More</span>
          {inbox.unseen > 0 && <span className="nav-badge" aria-label="New report" />}
        </button>
      </nav>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            id="more-sheet"
            ref={sheetRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet__handle" aria-hidden="true" />
            <ul className="sheet__list">
              {DESTINATIONS.filter((d) => !d.mobilePrimary).map((d) => (
                <li key={d.to}>
                  <NavLink to={d.to} className="sheet__link">
                    <Icon name={d.icon} size={22} />
                    <span>{d.label}</span>
                    {d.to === '/insights' && inbox.unseen > 0 && <span className="new-dot">New</span>}
                    <Icon name="chevronRight" size={18} className="sheet__chev" />
                  </NavLink>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--ghost sheet__close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
