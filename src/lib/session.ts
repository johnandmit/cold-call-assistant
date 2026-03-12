// Session-level suppression and stats tracking
const SUPPRESSED_KEY = 'sales-assistant-suppressed';
const SESSION_STATS_KEY = 'sales-assistant-session-stats';

export function getSuppressedIds(): Set<string> {
  try {
    const data = sessionStorage.getItem(SUPPRESSED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch { return new Set(); }
}

export function suppressContact(id: string) {
  const set = getSuppressedIds();
  set.add(id);
  sessionStorage.setItem(SUPPRESSED_KEY, JSON.stringify([...set]));
}

export function isContactSuppressed(id: string): boolean {
  return getSuppressedIds().has(id);
}

export interface SessionStats {
  sessionStart: string;
  callsMade: number;
  outcomes: Record<string, number>;
}

export function getSessionStats(): SessionStats {
  try {
    const data = sessionStorage.getItem(SESSION_STATS_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return { sessionStart: new Date().toISOString(), callsMade: 0, outcomes: {} };
}

export function recordCallOutcome(outcome: string) {
  const stats = getSessionStats();
  stats.callsMade++;
  stats.outcomes[outcome] = (stats.outcomes[outcome] || 0) + 1;
  sessionStorage.setItem(SESSION_STATS_KEY, JSON.stringify(stats));
}
