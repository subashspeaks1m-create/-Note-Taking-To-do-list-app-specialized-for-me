/**
 * Hands a file the app made to the person. In a normal browser that is a
 * temporary download link. Inside the claude.ai app link, pages may not
 * download directly, so the file goes through the viewer's own save prompt.
 */
interface Downloads {
  save(request: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }>;
}

let pending: Promise<Downloads | null> | null = null;

function viewerDownloads(): Promise<Downloads | null> {
  const runtime = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  if (typeof runtime?.use !== 'function') return Promise.resolve(null);
  pending ??= runtime
    .use('downloads')
    .then((d) => (d && typeof (d as Downloads).save === 'function' ? (d as Downloads) : null))
    .catch(() => null);
  return pending;
}

function linkDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** Thrown when the person said no to the save prompt; callers stay quiet about it. */
export class SaveDeclined extends Error {
  constructor() {
    super('Save canceled.');
    this.name = 'SaveDeclined';
  }
}

/** Saves the file. Resolves once it is handed over; rejects with SaveDeclined or a plain-language Error. */
export async function saveFile(data: Blob | string, fileName: string, type = 'application/octet-stream'): Promise<void> {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const downloads = await viewerDownloads();
  if (!downloads) {
    linkDownload(blob, fileName);
    return;
  }
  try {
    await downloads.save({ filename: fileName, data: blob });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'declined') throw new SaveDeclined();
    if (code === 'rate_limited') throw new Error('A save prompt is already open. Finish that one first.');
    throw new Error('This view would not save the file. Try again, or open the app in a browser.');
  }
}
