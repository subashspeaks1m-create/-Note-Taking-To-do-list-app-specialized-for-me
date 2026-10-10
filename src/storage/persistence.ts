import type { Repository } from './repo';

let requested = false;

/**
 * After the first real save, asks the browser to keep this site's data
 * through storage pressure, and records the honest answer for Settings.
 * Browsers may grant or deny silently; neither case blocks saving.
 */
export async function requestPersistenceOnce(repo: Repository): Promise<void> {
  if (requested) return;
  requested = true;
  try {
    const meta = await repo.getMeta();
    if (meta && meta.persistence !== 'not-requested') return;
    if (!navigator.storage?.persist) {
      await repo.setPersistence('unsupported');
      return;
    }
    const granted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    await repo.setPersistence(granted ? 'granted' : 'denied');
  } catch {
    // Reporting persistence is informational; a failure here must not affect the save.
  }
}
