import { Session } from '@/types';
import { v4 } from '@/lib/uuid';
import { getActiveCampaignId } from '@/lib/storage';

function getSessionsKey(campaignId?: string): string {
  const cid = campaignId || getActiveCampaignId();
  return `sales-assistant-sessions-${cid}`;
}

const SUPPRESSED_KEY = 'sales-assistant-suppressed';
const SKIPPED_KEY = 'sales-assistant-skipped';
const ACTIVE_SESSION_KEY = 'sales-assistant-active-session';

// Suppression (session-level, persists for the day)
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

// Skipped contacts — daily reset
const SKIP_DATE_KEY = 'sales-assistant-skip-date';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getSkippedIds(): Set<string> {
  try {
    const dateStr = localStorage.getItem(SKIP_DATE_KEY);
    if (dateStr !== getToday()) {
      localStorage.removeItem(SKIPPED_KEY);
      localStorage.setItem(SKIP_DATE_KEY, getToday());
      return new Set();
    }
    const data = localStorage.getItem(SKIPPED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch { return new Set(); }
}

export function skipContact(id: string) {
  localStorage.setItem(SKIP_DATE_KEY, getToday());
  const set = getSkippedIds();
  set.add(id);
  localStorage.setItem(SKIPPED_KEY, JSON.stringify([...set]));
}

// Named Sessions (campaign-scoped)
export function getSessions(campaignId?: string): Session[] {
  try {
    const data = localStorage.getItem(getSessionsKey(campaignId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveSessions(sessions: Session[], campaignId?: string) {
  localStorage.setItem(getSessionsKey(campaignId), JSON.stringify(sessions));
}

function formatSessionName(date: Date): string {
  const day = date.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
                 day === 2 || day === 22 ? 'nd' :
                 day === 3 || day === 23 ? 'rd' : 'th';
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}${suffix} of ${month}, ${time}`;
}

export function startSession(campaignId?: string): Session {
  const now = new Date();
  const session: Session = {
    id: v4(),
    name: formatSessionName(now),
    startedAt: now.toISOString(),
    endedAt: '',
    callsMade: 0,
    outcomes: {},
  };
  const sessions = getSessions(campaignId);
  sessions.push(session);
  saveSessions(sessions, campaignId);
  localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
  return session;
}

export function getActiveSession(campaignId?: string): Session | null {
  const id = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!id) return null;
  const sessions = getSessions(campaignId);
  return sessions.find(s => s.id === id) || null;
}

export function getOrCreateActiveSession(campaignId?: string): Session {
  const existing = getActiveSession(campaignId);
  if (existing) return existing;
  return startSession(campaignId);
}

export function endActiveSession(campaignId?: string) {
  const id = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!id) return;
  const sessions = getSessions(campaignId);
  const idx = sessions.findIndex(s => s.id === id);
  if (idx !== -1) {
    sessions[idx].endedAt = new Date().toISOString();
    saveSessions(sessions, campaignId);
  }
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function recordCallOutcome(outcome: string, campaignId?: string) {
  const session = getOrCreateActiveSession(campaignId);
  session.callsMade++;
  session.outcomes[outcome] = (session.outcomes[outcome] || 0) + 1;
  const sessions = getSessions(campaignId);
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx !== -1) {
    sessions[idx] = session;
    saveSessions(sessions, campaignId);
  }
}

// Legacy compat
export interface SessionStats {
  sessionStart: string;
  callsMade: number;
  outcomes: Record<string, number>;
}

export function getSessionStats(campaignId?: string): SessionStats {
  const session = getActiveSession(campaignId);
  if (session) {
    return { sessionStart: session.startedAt, callsMade: session.callsMade, outcomes: session.outcomes };
  }
  return { sessionStart: new Date().toISOString(), callsMade: 0, outcomes: {} };
}
