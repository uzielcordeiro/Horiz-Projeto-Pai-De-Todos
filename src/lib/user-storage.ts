/**
 * Financial data lives in this browser's localStorage. Every key is scoped to
 * the signed-in user id so two accounts on the same browser never see each
 * other's data, and a brand-new account always starts empty.
 */
export const userKey = (userId: string, base: string) => `u:${userId}:${base}`;

/** Legacy (unscoped) keys are adopted once by the first account that opens the app, then removed. */
export function adoptLegacyKeys(userId: string, bases: string[]) {
  try {
    const claimed = localStorage.getItem("horiz-legacy-owner");
    if (claimed && claimed !== userId) {
      for (const b of bases) localStorage.removeItem(b);
      return;
    }
    let moved = false;
    for (const b of bases) {
      const raw = localStorage.getItem(b);
      if (raw == null) continue;
      if (localStorage.getItem(userKey(userId, b)) == null) localStorage.setItem(userKey(userId, b), raw);
      localStorage.removeItem(b);
      moved = true;
    }
    if (moved) localStorage.setItem("horiz-legacy-owner", userId);
  } catch {
    /* ignore */
  }
}
