import { useEffect, useRef, useState } from 'react';
import { asset } from './asset';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { APP_NAME } from '../domain/config';
import { useDisplayPrefs } from './displayPrefs';

/** Which build stage this preview shows; the note reappears for each new stage. */
const PREVIEW_STAGE = 3;

interface Destination {
  to: string;
  label: string;
  icon: IconName;
  mobilePrimary: boolean;
}

export const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Today', icon: 'today', mobilePrimary: true },
  { to: '/visions', label: 'Visions', icon: 'vision', mobilePrimary: true },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', mobilePrimary: true },
  { to: '/journal', label: 'Journal', icon: 'journal', mobilePrimary: true },
  { to: '/character', label: 'Character', icon: 'character', mobilePrimary: false },
  { to: '/insights', label: 'Insights', icon: 'insights', mobilePrimary: false },
  { to: '/settings', label: 'Settings', icon: 'settings', mobilePrimary: false },
];

export function AppShell() {
  const { prefs, setPref } = useDisplayPrefs();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

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
      <Rail />
      <main id="main" ref={mainRef} tabIndex={-1} className="shell__main">
        {prefs.stageBannerDismissed !== PREVIEW_STAGE && (
          <div className="stage-banner" role="note">
            <span className="stage-banner__tag">Stage {PREVIEW_STAGE} preview</span>
            <span>Visions, goals, daily habits and the mind map are live. Streaks and reports come next in stage 4; XP and suits in stage 5.</span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss preview note" onClick={() => setPref('stageBannerDismissed', PREVIEW_STAGE)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <Outlet />
      </main>
      <BottomBar />
    </div>
  );
}

function Rail() {
  const { prefs, setPref } = useDisplayPrefs();
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail__brand">
        <img src={asset('/assets/ui/logo-mark.svg')} alt="" width={34} height={34} />
        <span className="rail__wordmark">{APP_NAME}</span>
      </div>
      <ul className="rail__list">
        {DESTINATIONS.map((d) => (
          <li key={d.to}>
            <NavLink to={d.to} end={d.to === '/'} className="rail__link" title={prefs.railCollapsed ? d.label : undefined}>
              <span className="rail__icon">
                <Icon name={d.icon} size={22} />
              </span>
              <span className="rail__label">{d.label}</span>
            </NavLink>
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

function BottomBar() {
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
          <NavLink key={d.to} to={d.to} end={d.to === '/'} className="bottom-bar__link">
            <Icon name={d.icon} size={22} />
            <span>{d.label}</span>
          </NavLink>
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
