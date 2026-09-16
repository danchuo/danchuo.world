/**
 * A project link's caption: the repository path. The scheme and `www.` are noise that eats half a
 * narrow row. On GitHub the HOST goes too when an owner/repo pair remains — that pair is the
 * repository's own name. Elsewhere the host STAYS, or a lone name says nothing. PRD §5.7
 */
export function repoLabel(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const bare = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  return bare.replace(/^github\.com\/(?=[^/]+\/[^/]+$)/i, "");
}
