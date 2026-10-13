import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useClock } from '../date/clock';
import { PROFILE_DEFAULTS } from '../domain/config';
import type { Profile } from '../domain/models';
import { CloudSync, connectCloud, inClaudeViewer, type CloudStatus } from './cloud';
import { AppDatabase, REAL_DB_NAME } from './db';
import { DEMO_DB_NAME, seedDemo } from './demo';
import { Repository } from './repo';

interface StorageCtx {
  repo: Repository;
  db: AppDatabase;
  profile: Profile;
  /** The account sync, when the app runs inside claude.ai. */
  cloud: CloudSync | null;
  /** True when this browser refused to store anything, so the account copy is the only copy. */
  memoryOnly: boolean;
}

/** Set when the page runs inside claude.ai but the account copy could not be reached. */
let cloudUnavailable = false;
const setCloudUnavailable = (v: boolean) => {
  cloudUnavailable = v;
};

const StorageContext = createContext<StorageCtx | null>(null);

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string; detail: string };
type Opened = { db: AppDatabase; repo: Repository; memoryOnly: boolean };

/** How long start-up waits for the account copy before opening with what this browser has. */
const CLOUD_WAIT_MS = 10_000;
/** After this long on the logo, offer a way out. */
const SLOW_BOOT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Dexie wraps the browser's own error; the inner one names the real cause. */
const errorName = (e: unknown): string => {
  const inner = (e as { inner?: unknown } | null)?.inner;
  return inner instanceof Error ? inner.name : e instanceof Error ? e.name : '';
};

/**
 * Opens the browser database and seeds first-run records. Safari sometimes
 * drops its database connection (after the phone sleeps, for example), so a
 * failed open is retried with a fresh connection before giving up.
 */
async function openLocal(name: string, now: () => Date): Promise<Opened> {
  let last: unknown;
  for (const wait of [0, 400, 1500]) {
    if (wait) await sleep(wait);
    const db = new AppDatabase(name);
    const repo = new Repository(db, now);
    try {
      await repo.ensureInitialized();
      return { db, repo, memoryOnly: false };
    } catch (e) {
      last = e;
      db.close();
      if (errorName(e) === 'QuotaExceededError') break;
    }
  }
  throw last;
}

/** A database held in this page's memory, used inside claude.ai when the browser refuses to store anything. */
async function openMemory(name: string, now: () => Date): Promise<Opened> {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  const db = new AppDatabase(name, { indexedDB, IDBKeyRange });
  const repo = new Repository(db, now);
  await repo.ensureInitialized();
  return { db, repo, memoryOnly: true };
}

/** Clean-up steps that must never stop the app from opening. */
async function tidy(step: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    console.warn(`Start-up step "${step}" failed; continuing`, e);
  }
}

/**
 * Opens the local database, seeds first-run records, and exposes the
 * repository. Inside claude.ai every change is also kept in your account, and
 * if this browser refuses to store anything the app runs from the account copy
 * alone. Elsewhere, if IndexedDB is unavailable the app says so plainly
 * instead of pretending to save.
 */
export function StorageProvider({ children, dbName = REAL_DB_NAME }: { children: ReactNode; dbName?: string }) {
  const clock = useClock();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [cloud, setCloud] = useState<CloudSync | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (boot.status !== 'loading') return;
    const timer = setTimeout(() => setSlow(true), SLOW_BOOT_MS);
    return () => clearTimeout(timer);
  }, [boot.status, attempt]);

  useEffect(() => {
    let cancelled = false;
    let sync: CloudSync | null = null;
    let local: Opened | null = null;
    const now = () => clock.now();
    const viewer = dbName === REAL_DB_NAME && inClaudeViewer();
    (async () => {
      try {
        local = await openLocal(dbName, now);
      } catch (e) {
        // The account copy can stand in for browser storage; elsewhere there is nothing to fall back to.
        if (!viewer) throw e;
        console.warn('Browser storage refused; running from the account copy', e);
        local = await openMemory(dbName, now);
      }
      const closeIfCancelled = () => {
        if (cancelled) local?.db.close();
        return cancelled;
      };
      if (closeIfCancelled()) return;
      const { db, repo } = local;
      if (dbName === DEMO_DB_NAME) await seedDemo(db, clock.now());
      // Inside claude.ai, browser storage may start empty: fill it from the account copy before showing anything.
      if (viewer) {
        const space = await connectCloud();
        if (closeIfCancelled()) return;
        if (!space) setCloudUnavailable(true);
        else {
          sync = new CloudSync(db, space, now, () => repo.dedupeStarterPlans());
          // If the account can't be reached, this keeps retrying in the background and saves nothing over it first.
          // The app opens after a short wait either way, so a slow connection never leaves it stuck on the logo.
          await Promise.race([sync.initial(), sleep(CLOUD_WAIT_MS)]);
          if (closeIfCancelled()) return;
          sync.start();
          setCloud(sync);
        }
      }
      if (dbName === REAL_DB_NAME) await tidy('one of each vision plan', () => repo.dedupeStarterPlans());
      await tidy('XP ledger', () => repo.repairLedger());
      if (closeIfCancelled()) return;
      setOpened(local);
      setBoot({ status: 'ready' });
    })().catch((e: unknown) => {
      if (cancelled) return;
      console.error('Could not open the app data', e);
      const name = errorName(e);
      setBoot({
        status: 'failed',
        message:
          name === 'QuotaExceededError'
            ? 'Your browser has no storage space left for this site.'
            : 'This browser would not let the app open its saved data. Private windows and strict privacy settings often do this.',
        detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200),
      });
    });
    return () => {
      cancelled = true;
      sync?.stop();
    };
  }, [dbName, clock, attempt]);

  const storedProfile = useLiveQuery(async () => (boot.status === 'ready' && opened ? opened.repo.getProfile() : undefined), [opened, boot.status]);
  const value = useMemo(() => {
    if (!opened) return null;
    const profile = storedProfile ?? { id: 'me' as const, ...PROFILE_DEFAULTS, createdAt: '', updatedAt: '' };
    return { repo: opened.repo, db: opened.db, profile, cloud, memoryOnly: opened.memoryOnly };
  }, [opened, storedProfile, cloud]);

  if (boot.status === 'failed') {
    return (
      <div className="boot boot--failed" role="alert">
        <img src={`${import.meta.env.BASE_URL}assets/ui/logo-mark.svg`} alt="" width={48} height={48} />
        <h1>Storage is unavailable</h1>
        <p>{boot.message}</p>
        <p>Open the app in a normal browser window, or allow site data for this page, then try again.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setBoot({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
        <p className="boot__detail">Details: {boot.detail}</p>
      </div>
    );
  }
  if (boot.status === 'loading' || !storedProfile || !value) {
    return (
      <div className="boot" aria-busy="true">
        <img src={`${import.meta.env.BASE_URL}assets/ui/logo-mark.svg`} alt="" width={48} height={48} />
        <span className="visually-hidden">Opening your data…</span>
        {slow && (
          <>
            <p className="boot__slow">This is taking longer than usual.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setSlow(false);
                setBoot({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  }
  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageCtx {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorage outside StorageProvider');
  return ctx;
}

/** The account sync state, for the save indicator and Settings. */
export function useCloudStatus(): CloudStatus {
  const { cloud } = useStorage();
  const subscribe = useCallback((fn: () => void) => (cloud ? cloud.subscribe(fn) : () => undefined), [cloud]);
  return useSyncExternalStore(subscribe, () => (cloud ? cloud.getStatus() : cloudUnavailable ? UNAVAILABLE : OFF));
}

const OFF: CloudStatus = { state: 'off' };
const UNAVAILABLE: CloudStatus = { state: 'unavailable' };

export function useRepo(): Repository {
  return useStorage().repo;
}

export function useProfile(): Profile {
  return useStorage().profile;
}
