/**
 * Resolves a bundled public asset against the deployment base, so the same
 * build works at a domain root or inside a sub-path preview.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
