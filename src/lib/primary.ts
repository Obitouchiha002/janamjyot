/**
 * Which kundli is "mine".
 *
 * The profile list comes newest-first, and every screen used to take the
 * first entry as the person's own chart. Linking a partner's kundli for
 * Rishta made THEM the newest — so Home greeted the user by their partner's
 * name, the Chat tab opened the partner's chart, and the morning notification
 * described the partner's day. Picked, in order:
 *   1. the kundli they marked as theirs, if it still exists;
 *   2. the one whose name matches their account's first name;
 *   3. the oldest — the first kundli anyone makes is almost always their own.
 */
const KEY = "jj:primary";

export function pickPrimary<T extends { id: string; name?: string }>(list: T[] | null | undefined, accountName?: string | null): T | undefined {
  if (!list?.length) return undefined;
  let chosen: string | null = null;
  try { chosen = localStorage.getItem(KEY); } catch { /* ignore */ }
  const mine = chosen ? list.find((p) => p.id === chosen) : undefined;
  if (mine) return mine;
  const first = (s?: string | null) => String(s || "").trim().split(/\s+/)[0].toLowerCase();
  const me = first(accountName);
  const byName = me ? list.find((p) => first(p.name) === me) : undefined;
  return byName ?? list[list.length - 1];
}

export function setPrimary(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
