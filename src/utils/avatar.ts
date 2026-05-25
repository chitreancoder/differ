/**
 * Two-letter avatar initials for a display name. Single-word names take the
 * first two letters; multi-word names take the first letter of the first and
 * last word. Empty/missing names fall back to "?".
 */
export function nameInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
