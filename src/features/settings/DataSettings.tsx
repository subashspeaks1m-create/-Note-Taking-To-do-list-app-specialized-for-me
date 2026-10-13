import { useLiveQuery } from 'dexie-react-hooks';
import { SaveDeclined } from '../../app/saveFile';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { dateKeyInZone, diffDays, formatMedium, formatTimeInZone } from '../../date/localDate';
import type { SchemaMeta } from '../../domain/models';
import { backupFileName, parseBackupText, previewImport, TABLE_LABEL, TABLES, type Backup, type ImportMode, type ImportPreview, type Validation } from '../../storage/backup';
import type { HistoryEntry } from '../../storage/cloud';
import { useCloudStatus, useProfile, useRepo, useStorage } from '../../storage/StorageProvider';
import { downloadText } from '../journal/journalParts';

const BACKUP_NUDGE_DAYS = 7;

function useMeta(): SchemaMeta | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => (await db.kv.get('meta'))?.value as SchemaMeta | undefined, [db]);
}

function useHasSnapshot(): boolean {
  const { db } = useStorage();
  return useLiveQuery(async () => !!(await db.kv.get('preImportBackup')), [db]) ?? false;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Backup, restore, storage status and reset. */
export function DataSettings() {
  const repo = useRepo();
  const toast = useToast();
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const meta = useMeta();
  const hasSnapshot = useHasSnapshot();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<{ name: string; validation: Validation; preview: ImportPreview | null } | null>(null);
  const [erasing, setErasing] = useState(false);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage !== undefined && e.quota !== undefined && setUsage({ used: e.usage, quota: e.quota })).catch(() => undefined);
  }, []);

  const lastBackup = meta?.lastBackupAt ? dateKeyInZone(new Date(meta.lastBackupAt), profile.timeZone) : null;
  const stale = !lastBackup || diffDays(lastBackup, today) >= BACKUP_NUDGE_DAYS;

  const download = async () => {
    try {
      const backup = await repo.createBackup();
      await downloadText(JSON.stringify(backup, null, 1), backupFileName(today), 'application/json');
      toast({ message: 'Backup downloaded. Keep it somewhere safe, like your cloud drive.', tone: 'success' });
    } catch (e) {
      if (e instanceof SaveDeclined) return;
      toast({ message: (e as Error).message || 'The backup could not be made.', tone: 'error' });
    }
  };

  const pick = async (file: File) => {
    const validation = parseBackupText(await file.text());
    const preview = validation.ok && validation.backup ? await previewImport(repo.db, validation.backup) : null;
    setChecked({ name: file.name, validation, preview });
  };

  const persist = async () => {
    try {
      const supported = typeof navigator.storage?.persist === 'function';
      const granted = supported ? await navigator.storage.persist() : false;
      await repo.setPersistence(supported ? (granted ? 'granted' : 'denied') : 'unsupported');
      toast({ message: granted ? 'Your browser will keep this data.' : 'The browser said no for now. Regular backups keep you safe.', tone: granted ? 'success' : 'neutral' });
    } catch {
      toast({ message: 'This browser does not support that request.', tone: 'neutral' });
    }
  };

  const persistence = meta?.persistence ?? 'not-requested';
  const cloud = useCloudStatus();

  return (
    <section className="settings-group" aria-labelledby="sg-data">
      <h2 id="sg-data" className="settings-group__title">
        Your data
      </h2>
      <p className="settings-group__lede">
        {cloud.state === 'off'
          ? 'Everything lives in this browser on this device. Nothing is sent anywhere. A backup file is how you move it or keep it safe.'
          : 'Everything is kept in this browser and saved to your Claude account after every change, privately (only you can see it). Opening the app on another device brings it all back. The OpenRouter key stays in this browser only.'}
      </p>

      {cloud.state !== 'off' && (
        <div className="setting">
          <span className="setting__label">
            Account copy
            <span className={`setting__help ${cloud.state === 'error' || cloud.state === 'unavailable' ? 'setting__help--warn' : ''}`}>
              {cloud.state === 'saved'
                ? `Up to date. Last saved ${formatMedium(dateKeyInZone(new Date(cloud.at), profile.timeZone))} at ${formatTimeInZone(new Date(cloud.at), profile.timeZone)}.`
                : cloud.state === 'saving'
                  ? 'Saving…'
                  : cloud.state === 'error'
                    ? cloud.message
                    : 'Could not reach your account in this view. Changes are only in this browser until it reconnects.'}
            </span>
          </span>
        </div>
      )}
      {cloud.state !== 'off' && <EarlierCopies />}

      <div className="setting">
        <span className="setting__label">
          Backup
          <span className={`setting__help ${stale ? 'setting__help--warn' : ''}`}>
            {lastBackup ? `Last backup ${formatMedium(lastBackup)}.` : 'No backup made yet.'}
            {stale && ' A weekly backup is a good habit.'}
          </span>
        </span>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => void download()}>
          <Icon name="download" size={16} /> Download backup
        </button>
      </div>

      <div className="setting">
        <span className="setting__label">
          Restore
          <span className="setting__help">Load a backup file. You see exactly what it holds before anything changes.</span>
        </span>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => fileRef.current?.click()}>
          Choose backup file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pick(f);
          }}
        />
      </div>

      {hasSnapshot && (
        <div className="setting">
          <span className="setting__label">
            Undo last import
            <span className="setting__help">Puts your data back exactly as it was before the last restore.</span>
          </span>
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() =>
              repo
                .undoImport()
                .then(() => toast({ message: 'Import undone. Your earlier data is back.', tone: 'success' }))
                .catch((e: Error) => toast({ message: e.message, tone: 'error' }))
            }
          >
            Undo import
          </button>
        </div>
      )}

      <div className="setting">
        <span className="setting__label">
          Journal as Markdown
          <span className="setting__help">Readable text of your entries, for notes apps.</span>
        </span>
        <Link to="/journal" className="btn btn--quiet btn--sm">
          Open Journal export
        </Link>
      </div>

      <div className="setting">
        <span className="setting__label">
          Storage
          <span className="setting__help">
            {persistence === 'granted'
              ? 'Protected: the browser will not clear this data to free space.'
              : persistence === 'unsupported'
                ? 'This browser cannot promise to keep data. Back up regularly.'
                : 'Not protected yet: under heavy storage pressure the browser could clear it.'}
            {usage && ` Using ${formatBytes(usage.used)}.`}
          </span>
        </span>
        {persistence !== 'granted' && persistence !== 'unsupported' && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => void persist()}>
            Ask to keep my data
          </button>
        )}
      </div>

      <div className="setting">
        <span className="setting__label">
          Erase everything
          <span className="setting__help">Deletes all tasks, journal entries, goals and progress on this device.</span>
        </span>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => setErasing(true)}>
          Erase…
        </button>
      </div>

      {checked && <RestoreDialog checked={checked} onClose={() => setChecked(null)} />}
      {erasing && <EraseDialog onClose={() => setErasing(false)} onBackup={download} />}
    </section>
  );
}

function RestoreDialog({ checked, onClose }: { checked: { name: string; validation: Validation; preview: ImportPreview | null }; onClose: () => void }) {
  const repo = useRepo();
  const toast = useToast();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const { validation, preview } = checked;
  const backup = validation.backup as Backup | null;

  const run = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const r = await repo.restoreBackup(backup, mode);
      toast({
        message: mode === 'replace' ? 'Backup restored.' : `Merged: ${r.added} added, ${r.updated} updated.`,
        tone: 'success',
        action: { label: 'Undo', run: () => repo.undoImport() },
      });
      onClose();
    } catch (e) {
      toast({ message: `Nothing was changed. ${(e as Error).message}`, tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={validation.ok ? 'Restore this backup?' : 'This file cannot be restored'}
      description={checked.name}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {validation.ok ? 'Cancel' : 'Close'}
          </button>
          {validation.ok && (
            <button type="button" className={`btn ${mode === 'replace' ? 'btn--danger' : 'btn--primary'}`} disabled={busy} onClick={() => void run()}>
              {busy ? 'Restoring…' : mode === 'merge' ? 'Merge into my data' : 'Replace my data'}
            </button>
          )}
        </>
      }
    >
      {!validation.ok ? (
        <>
          <p>Nothing was changed. Here is what is wrong with the file:</p>
          <ul className="restore__list restore__list--bad">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      ) : (
        <div className="restore">
          {backup && <p className="restore__meta">Made {formatMedium(dateKeyInZone(new Date(backup.exportedAt), 'UTC'))}.</p>}
          <table className="restore__table">
            <thead>
              <tr>
                <th>What</th>
                <th>In file</th>
                <th>New here</th>
                <th>Differs</th>
              </tr>
            </thead>
            <tbody>
              {TABLES.filter((t) => (validation.counts[t] ?? 0) > 0 && t !== 'entryRevisions').map((t) => (
                <tr key={t}>
                  <td>{TABLE_LABEL[t]}</td>
                  <td className="tabular">{validation.counts[t]}</td>
                  <td className="tabular">{preview?.added[t] ?? 0}</td>
                  <td className="tabular">{preview?.changed[t] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {validation.warnings.length > 0 && (
            <ul className="restore__list">
              {validation.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <fieldset className="restore__modes">
            <legend className="visually-hidden">How to restore</legend>
            <label className={`restore__mode ${mode === 'merge' ? 'is-on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <strong>Merge</strong> (recommended). Adds what is new. Where both have the same record, the more recently changed copy wins. Your name and settings stay.
              </span>
            </label>
            <label className={`restore__mode ${mode === 'replace' ? 'is-on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <strong>Replace</strong>. Your current data is swapped for the file's.
              </span>
            </label>
          </fieldset>
          <p className="restore__safe">Either way, a copy of your current data is kept first, so you can undo this import.</p>
        </div>
      )}
    </Dialog>
  );
}

function EraseDialog({ onClose, onBackup }: { onClose: () => void; onBackup: () => Promise<void> }) {
  const repo = useRepo();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Erase everything on this device?"
      description="This cannot be undone without a backup file."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={typed.trim().toUpperCase() !== 'ERASE'}
            onClick={() =>
              repo
                .eraseAll()
                .then(() => {
                  toast({ message: 'Everything was erased. Starting fresh.' });
                  onClose();
                })
                .catch((e: Error) => toast({ message: e.message, tone: 'error' }))
            }
          >
            Erase everything
          </button>
        </>
      }
    >
      <div className="erase">
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() =>
            void onBackup().then(() => setBackedUp(true))
          }
        >
          <Icon name="download" size={16} /> {backedUp ? 'Backup downloaded' : 'Download a backup first'}
        </button>
        <label className="field">
          <span className="field__label">Type ERASE to confirm</span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      </div>
    </Dialog>
  );
}

/** Earlier account copies (one per day, and one before any save that removed a lot), each one tap from coming back. */
function EarlierCopies() {
  const { cloud } = useStorage();
  const { timeZone } = useProfile();
  const toast = useToast();
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!cloud) return null;

  const load = async () => {
    setBusy('list');
    try {
      setList(await cloud.earlierCopies());
    } catch {
      toast({ message: 'Could not reach your account. Try again in a moment.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (e: HistoryEntry) => {
    setBusy(e.name);
    try {
      const n = await cloud.restoreEarlier(e);
      toast({ message: n ? `Brought back ${n} record${n === 1 ? '' : 's'} from that copy.` : 'Everything in that copy is already here.', tone: 'success' });
    } catch (err) {
      toast({ message: (err as Error).message || 'That copy could not be brought back.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const when = (iso: string) => `${formatMedium(dateKeyInZone(new Date(iso), timeZone))}, ${formatTimeInZone(new Date(iso), timeZone)}`;

  return (
    <div className="setting setting--stack">
      <span className="setting__label">
        Earlier copies
        <span className="setting__help">Your account keeps a copy from each day and one before any big removal, such as an erase. Bringing one back adds its records; nothing you have now is removed.</span>
      </span>
      {list === null ? (
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => void load()} disabled={busy === 'list'}>
          {busy === 'list' ? 'Looking…' : 'Show earlier copies'}
        </button>
      ) : list.length === 0 ? (
        <p className="setting__help">No earlier copies yet. The first one is kept with tomorrow's first save.</p>
      ) : (
        <ul className="earlier-copies">
          {list.map((e) => (
            <li key={e.name}>
              <span>
                {when(e.savedAt)}
                <span className="setting__help">
                  {e.kind === 'drop' ? 'Kept before a big removal' : 'Daily copy'}
                  {e.records !== null ? ` · ${e.records} records` : ''}
                </span>
              </span>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => void restore(e)} disabled={busy !== null}>
                {busy === e.name ? 'Bringing back…' : 'Bring back'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
