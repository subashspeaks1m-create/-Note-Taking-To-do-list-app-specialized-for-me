import Dexie from 'dexie';
import { exportBackup, importBackup, validateBackup, type Backup } from './backup';
import type { AppDatabase } from './db';

/**
 * Account sync for the claude.ai app link. Browser storage inside that link
 * is not guaranteed to last (the viewer can start it empty), so when the page
 * runs there, every change is also saved to the viewer's own private space in
 * the artifact's database, and a device that opens empty is filled from it.
 * Outside claude.ai (a local run, a real website) there is no `window.claude`
 * and nothing here runs: the browser database is the only store.
 *
 * Layout under `data/users/<id>/`: a `manifest` document naming the current
 * slot, and the full backup gzip-compressed in chunks `a-0…` or `b-0…`. A save
 * writes the slot not in use, then flips the manifest, so a save cut off
 * halfway never damages the last good copy.
 */

/** The slice of the claude.ai runtime this file uses. */
export interface CloudDocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
export interface CloudDocRef { get(): Promise<CloudDocSnap>; set(data: Record<string, unknown>): Promise<void> }
export interface CloudDb { doc(path: string): CloudDocRef }
interface CloudUser { id(): Promise<string | null> }
interface ClaudeRuntime { use(name: string): Promise<unknown> }

export type CloudStatus =
  | { state: 'off' }
  | { state: 'unavailable' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'error'; message: string };

type Slot = 'a' | 'b';

export interface Manifest {
  slot: Slot;
  chunks: number;
  /** Unique per save (two devices can save in the same millisecond). */
  id: string;
  savedAt: string;
  hash: string;
  encoding: 'gzip-base64' | 'json';
  prev: { slot: Slot; chunks: number; id: string; encoding: Manifest['encoding'] } | null;
}

/** The last state this device and the account agreed on. Kept in the device's own database. */
interface SyncBase { id: string; hash: string }
export const CLOUD_BASE_KEY = 'cloudBase';

const CHUNK_CHARS = { 'gzip-base64': 180_000, json: 40_000 } as const;
const DEBOUNCE_MS = 400;
const RETRY_MS = [3000, 10_000, 30_000, 60_000];
const LOCK_WAIT_MS = 15_000;

// ---------- Connecting ----------

/** Resolves the viewer's private sync space, or null when this page isn't running inside claude.ai. */
export async function connectCloud(timeoutMs = 15_000): Promise<CloudSpace | null> {
  const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!runtime || typeof runtime.use !== 'function') return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  try {
    const got = await Promise.race([Promise.all([runtime.use('db'), runtime.use('user')]), timeout]);
    if (!got) return null;
    const [db, user] = got as [CloudDb | null, CloudUser | null];
    const id = db && user ? await user.id() : null;
    return db && id ? new CloudSpace(db, `data/users/${id}`) : null;
  } catch {
    return null;
  }
}

/** True when the page is framed by claude.ai (so account sync is expected to work). */
export function inClaudeViewer(): boolean {
  return typeof (window as unknown as { claude?: ClaudeRuntime }).claude?.use === 'function';
}

// ---------- Encoding ----------

/** Short, stable fingerprint of the saved content (cyrb53). */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The backup's content as text, without the parts that differ per device or per moment. */
export function contentOf(backup: Backup): string {
  const kv = backup.tables.kv.filter((r) => r.key !== 'meta' && r.key !== CLOUD_BASE_KEY && r.key !== 'preImportBackup');
  return JSON.stringify({ ...backup, exportedAt: '', tables: { ...backup.tables, kv } });
}

const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function gzip(text: string): Promise<string> {
  const stream = new Response(text).body!.pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function split(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

// ---------- The account copy ----------

export class CloudSpace {
  constructor(private db: CloudDb, private base: string) {}

  private ref(name: string) {
    return this.db.doc(`${this.base}/${name}`);
  }

  async manifest(): Promise<Manifest | null> {
    const snap = await this.ref('manifest').get();
    const m = snap.exists ? (snap.data() as Partial<Manifest> | undefined) : undefined;
    return m && (m.slot === 'a' || m.slot === 'b') && typeof m.chunks === 'number' && typeof m.id === 'string' && typeof m.savedAt === 'string' ? (m as Manifest) : null;
  }

  /** Reads one saved copy back; null if any piece is missing or from a different save. */
  private async readSlot(slot: Slot, chunks: number, id: string, encoding: Manifest['encoding']): Promise<Backup | null> {
    const parts = await Promise.all(Array.from({ length: chunks }, (_, i) => this.ref(`${slot}-${i}`).get()));
    const texts: string[] = [];
    for (const p of parts) {
      const d = p.exists ? p.data() : undefined;
      if (!d || d.id !== id || typeof d.text !== 'string') return null;
      texts.push(d.text);
    }
    try {
      const joined = texts.join('');
      const json = encoding === 'gzip-base64' ? await gunzip(joined) : joined;
      const v = validateBackup(JSON.parse(json));
      return v.ok ? v.backup : null;
    } catch {
      return null;
    }
  }

  /** The latest good copy, falling back to the one before it. */
  async load(m: Manifest): Promise<Backup | null> {
    return (await this.readSlot(m.slot, m.chunks, m.id, m.encoding)) ?? (m.prev ? await this.readSlot(m.prev.slot, m.prev.chunks, m.prev.id, m.prev.encoding) : null);
  }

  async save(content: string, hash: string, savedAt: string, current: Manifest | null): Promise<Manifest> {
    const id = `${savedAt}~${Math.random().toString(36).slice(2, 10)}`;
    const encoding: Manifest['encoding'] = canGzip() ? 'gzip-base64' : 'json';
    const body = encoding === 'gzip-base64' ? await gzip(content) : content;
    const pieces = split(body, CHUNK_CHARS[encoding]);
    const slot: Slot = current?.slot === 'a' ? 'b' : 'a';
    await Promise.all(pieces.map((text, i) => this.ref(`${slot}-${i}`).set({ id, i, text })));
    const next: Manifest = {
      slot, chunks: pieces.length, id, savedAt, hash, encoding,
      prev: current ? { slot: current.slot, chunks: current.chunks, id: current.id, encoding: current.encoding } : null,
    };
    await this.ref('manifest').set({ ...next });
    return next;
  }
}

// ---------- Keeping the two in step ----------

export class CloudSync {
  private status: CloudStatus = { state: 'off' };
  private listeners = new Set<(s: CloudStatus) => void>();
  private manifest: Manifest | null = null;
  private lastHash: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  /** Nothing is saved to the account until this device has first caught up with it. */
  private pulled = false;
  private stopFns: (() => void)[] = [];

  constructor(
    private db: AppDatabase,
    private space: CloudSpace,
    private now: () => Date,
    /** Tidies data after the account copy is brought in (for example folding duplicate starter plans). */
    private afterImport: () => Promise<unknown> = async () => undefined,
  ) {}

  getStatus(): CloudStatus {
    return this.status;
  }

  subscribe(fn: (s: CloudStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: CloudStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  private async local(): Promise<{ backup: Backup; content: string; hash: string }> {
    const backup = await exportBackup(this.db, this.now());
    const content = contentOf(backup);
    return { backup, content, hash: fingerprint(content) };
  }

  private async syncBase(): Promise<SyncBase | null> {
    return ((await this.db.kv.get(CLOUD_BASE_KEY))?.value as SyncBase | undefined) ?? null;
  }

  private async setBase(base: SyncBase) {
    await this.db.kv.put({ key: CLOUD_BASE_KEY, value: base });
  }

  /**
   * Brings this device and the account copy together. Run before the app
   * shows anything, and again whenever the page comes back into view.
   * - No account copy yet: this device's data becomes it.
   * - This device has never synced (fresh or emptied storage): the account copy fills it.
   * - Only the account changed since the last sync: it replaces this device's copy.
   * - Only this device changed: it is saved to the account.
   * - Both changed (two devices): merged record by record, newest edit wins, then saved.
   */
  async pull(): Promise<void> {
    await this.catchUp();
    this.pulled = true;
  }

  private async catchUp(): Promise<void> {
    const m = await this.space.manifest();
    const base = await this.syncBase();
    const mine = await this.local();
    this.manifest = m;
    if (!m) {
      await this.saveNow(mine.content, mine.hash);
      return;
    }
    if (base && base.id === m.id) {
      this.lastHash = m.hash;
      if (mine.hash !== m.hash) await this.saveNow(mine.content, mine.hash);
      else this.set({ state: 'saved', at: m.savedAt });
      return;
    }
    if (mine.hash === m.hash) {
      await this.setBase({ id: m.id, hash: m.hash });
      this.lastHash = m.hash;
      this.set({ state: 'saved', at: m.savedAt });
      return;
    }
    const theirs = await this.space.load(m);
    if (!theirs) {
      // The account copy can't be read; keep this device's data and save it fresh.
      await this.saveNow(mine.content, mine.hash);
      return;
    }
    const untouchedHere = !base || base.hash === mine.hash;
    await importBackup(this.db, theirs, untouchedHere ? 'replace' : 'merge');
    await this.afterImport();
    if (untouchedHere) {
      await this.setBase({ id: m.id, hash: m.hash });
      this.lastHash = m.hash;
      this.set({ state: 'saved', at: m.savedAt });
    } else {
      const merged = await this.local();
      await this.saveNow(merged.content, merged.hash);
    }
  }

  /** Watches the database and saves each change to the account shortly after it happens. */
  start(): void {
    const prefix = `idb://${this.db.name}/`;
    const onChange = (parts: Record<string, unknown>) => {
      if (!Object.keys(parts).some((k) => k.startsWith(prefix))) return;
      if (this.status.state === 'saved') this.set({ state: 'saving' });
      this.schedule();
    };
    Dexie.on('storagemutated', onChange);
    this.stopFns.push(() => Dexie.on('storagemutated').unsubscribe(onChange));
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.flush();
      else void this.run(() => this.pull());
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    this.stopFns.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    });
  }

  stop(): void {
    for (const f of this.stopFns.splice(0)) f();
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay = DEBOUNCE_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Saves now if anything changed since the last save. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.run(async () => {
      if (!this.pulled) return this.pull();
      const mine = await this.local();
      if (mine.hash === this.lastHash) {
        if (this.status.state === 'saving' && this.manifest) this.set({ state: 'saved', at: this.manifest.savedAt });
        return;
      }
      await this.saveNow(mine.content, mine.hash);
    });
  }

  /** One sync at a time; a request during a sync runs once more afterwards. */
  private async run(job: () => Promise<void>): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        // Two copies of the page can share one browser database; only one syncs at a time.
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
        // A copy of the page stuck mid-save in another tab must not hold this one up for ever.
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(LOCK_WAIT_MS) : undefined;
        if (locks?.request) await locks.request('pog-cloud-sync', signal ? { signal } : {}, job);
        else await job();
        this.failures = 0;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        this.set({
          state: 'error',
          message: code === 'quota_exceeded' ? 'Your account storage for this app is full.' : 'Could not reach your account. Changes are kept on this device and will be saved when it reconnects.',
        });
        if (code !== 'quota_exceeded' && code !== 'revoked') this.schedule(RETRY_MS[Math.min(this.failures++, RETRY_MS.length - 1)]);
      } finally {
        this.running = null;
      }
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    })();
    return this.running;
  }

  private async saveNow(content: string, hash: string) {
    this.set({ state: 'saving' });
    const savedAt = this.now().toISOString();
    this.manifest = await this.space.save(content, hash, savedAt, this.manifest);
    this.lastHash = hash;
    await this.setBase({ id: this.manifest.id, hash });
    this.set({ state: 'saved', at: savedAt });
  }

  /** The start-up sync. If the account can't be reached it keeps retrying in the background. */
  async initial(): Promise<void> {
    this.set({ state: 'saving' });
    await this.run(() => this.pull());
  }
}
