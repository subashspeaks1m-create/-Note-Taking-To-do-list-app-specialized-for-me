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
}

/** Set when the page runs inside claude.ai but the account copy could not be reached. */
let cloudUnavailable = false;
const setCloudUnavailable = (v: boolean) => {
  cloudUnavailable = v;
};

const StorageContext = createContext<StorageCtx | null>(null);

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

/**
 * Opens the local database, seeds first-run records, and exposes the
 * repository. If IndexedDB is unavailable (some private modes, blocked site
 * data) the app says so plainly instead of pretending to save.
 */
export function StorageProvider({ children, dbName = REAL_DB_NAME }: { children: ReactNode; dbName?: string }) {
  const clock = useClock();
  const [db] = useState(() => new AppDatabase(dbName));
  const repo = useMemo(() => new Repository(db, () => clock.now()), [db, clock]);
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [cloud, setCloud] = useState<CloudSync | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sync: CloudSync | null = null;
    repo
      .ensureInitialized()
      .then(() => (dbName === DEMO_DB_NAME ? seedDemo(db, clock.now()) : undefined))
      // Inside claude.ai, browser storage may start empty: fill it from the account copy before showing anything.
      .then(async () => {
        if (dbName !== REAL_DB_NAME || !inClaudeViewer()) return;
        const space = await connectCloud();
        if (cancelled) return;
        if (!space) {
          setCloudUnavailable(true);
          return;
        }
        sync = new CloudSync(db, space, () => clock.now());
        // If the account can't be reached, this keeps retrying in the background and saves nothing over it first.
        await sync.initial();
        if (cancelled) return;
        sync.start();
        setCloud(sync);
      })
      .then(() => repo.repairLedger())
      .then(() => !cancelled && setBoot({ status: 'ready' }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : '';
        setBoot({
          status: 'failed',
          message:
            name === 'QuotaExceededError'
              ? 'Your browser has no storage space left for this site.'
              : 'This browser is blocking local storage for this site, so nothing could be saved. Private windows and strict privacy settings often do this.',
        });
      });
    return () => {
      cancelled = true;
      sync?.stop();
    };
  }, [repo, db, dbName, clock]);

  const storedProfile = useLiveQuery(async () => (boot.status === 'ready' ? repo.getProfile() : undefined), [repo, boot.status]);
  const value = useMemo(() => {
    const profile = storedProfile ?? { id: 'me' as const, ...PROFILE_DEFAULTS, createdAt: '', updatedAt: '' };
    return { repo, db, profile, cloud };
  }, [repo, db, storedProfile, cloud]);

  if (boot.status === 'failed') {
    return (
      <div className="boot boot--failed" role="alert">
        <img src={`${import.meta.env.BASE_URL}assets/ui/logo-mark.svg`} alt="" width={48} height={48} />
        <h1>Storage is unavailable</h1>
        <p>{boot.message}</p>
        <p>Open the app in a normal browser window, or allow site data for this page, then reload.</p>
      </div>
    );
  }
  if (boot.status === 'loading' || !storedProfile) {
    return (
      <div className="boot" aria-busy="true">
        <img src={`${import.meta.env.BASE_URL}assets/ui/logo-mark.svg`} alt="" width={48} height={48} />
        <span className="visually-hidden">Opening your data…</span>
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
