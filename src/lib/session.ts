import { Session } from '@/types';
import { v4 } from '@/lib/uuid';
import { getActiveCampaignId } from '@/lib/storage';
import { pushSessions } from '@/lib/supabase-sync';

import { supabase } from '@/lib/supabase';

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || '';
}

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

export function clearSuppressed() {
  sessionStorage.removeItem(SUPPRESSED_KEY);
}

export function isContactSuppressed(id: string): boolean {
  return getSuppressedIds().has(id);
}

export function getSkippedIds(): Set<string> {
  try {
    const data = sessionStorage.getItem(SKIPPED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch { return new Set(); }
}

export function skipContact(id: string) {
  const set = getSkippedIds();
  set.add(id);
  sessionStorage.setItem(SKIPPED_KEY, JSON.stringify([...set]));
}

export function clearSkipped() {
  sessionStorage.removeItem(SKIPPED_KEY);
}

// Named Sessions (campaign-scoped)
export function getSessions(campaignId?: string): Session[] {
  try {
    const data = localStorage.getItem(getSessionsKey(campaignId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveSessions(sessions: Session[], campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  localStorage.setItem(getSessionsKey(cid), JSON.stringify(sessions));
  
  getUserId().then(uid => {
    if (uid && cid) {
      pushSessions(uid, cid, sessions).catch(() => {});
    }
  });
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

export async function startSession(campaignId?: string): Promise<Session> {
  const { data: { session: authSession } } = await supabase.auth.getSession();
  const now = new Date();
  const session: Session = {
    id: v4(),
    name: formatSessionName(now),
    startedAt: now.toISOString(),
    endedAt: '',
    callsMade: 0,
    outcomes: {},
    userId: authSession?.user?.id || '',
    userEmail: authSession?.user?.email || '',
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

export async function getOrCreateActiveSession(campaignId?: string): Promise<Session> {
  const existing = getActiveSession(campaignId);
  if (existing) return existing;
  return await startSession(campaignId);
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
  // Clear session-level skips and suppressions
  clearSkipped();
  clearSuppressed();
}

export async function recordCallOutcome(outcome: string, campaignId?: string) {
  const session = await getOrCreateActiveSession(campaignId);
  if (outcome !== 'no_answer' && outcome !== 'phone_not_working') {
    session.callsMade++;
  }
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
