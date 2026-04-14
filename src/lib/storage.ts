import { Contact, Call, Settings, DEFAULT_SETTINGS, Campaign } from '@/types';
import { v4 } from '@/lib/uuid';

const CAMPAIGNS_KEY = 'sales-assistant-campaigns';
const SETTINGS_KEY = 'sales-assistant-settings';

// Legacy keys (pre-campaign)
const LEGACY_CONTACTS_KEY = 'sales-assistant-contacts';
const LEGACY_CALLS_KEY = 'sales-assistant-calls';
const LEGACY_SESSIONS_KEY = 'sales-assistant-sessions';

const CAMPAIGN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

// ─── Campaigns ───────────────────────────────────────────

export function getCampaigns(): Campaign[] {
  try {
    const data = localStorage.getItem(CAMPAIGNS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveCampaigns(campaigns: Campaign[]) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

export function createCampaign(name: string, color?: string): Campaign {
  const campaigns = getCampaigns();
  const campaign: Campaign = {
    id: v4(),
    name,
    createdAt: new Date().toISOString(),
    color: color || CAMPAIGN_COLORS[campaigns.length % CAMPAIGN_COLORS.length],
  };
  campaigns.push(campaign);
  saveCampaigns(campaigns);
  return campaign;
}

export function renameCampaign(id: string, name: string) {
  const campaigns = getCampaigns();
  const idx = campaigns.findIndex(c => c.id === id);
  if (idx !== -1) {
    campaigns[idx].name = name;
    saveCampaigns(campaigns);
  }
}

export function updateCampaignColor(id: string, color: string) {
  const campaigns = getCampaigns();
  const idx = campaigns.findIndex(c => c.id === id);
  if (idx !== -1) {
    campaigns[idx].color = color;
    saveCampaigns(campaigns);
  }
}

export function deleteCampaign(id: string) {
  const campaigns = getCampaigns().filter(c => c.id !== id);
  saveCampaigns(campaigns);
  // Clean up campaign data
  localStorage.removeItem(`sales-assistant-contacts-${id}`);
  localStorage.removeItem(`sales-assistant-calls-${id}`);
  localStorage.removeItem(`sales-assistant-sessions-${id}`);
}

// ─── Active Campaign ─────────────────────────────────────

export function getActiveCampaignId(): string {
  const settings = getSettings();
  return settings.activeCampaignId || '';
}

export function setActiveCampaignId(id: string) {
  const settings = getSettings();
  settings.activeCampaignId = id;
  saveSettings(settings);
  // Notify components (Layout, Sidebar) without polling
  window.dispatchEvent(new Event('campaign-changed'));
}

/**
 * Ensures campaigns exist. On first load, migrates legacy data into a "Default" campaign.
 * Returns the active campaign ID.
 */
export function ensureCampaigns(): string {
  let campaigns = getCampaigns();

  if (campaigns.length === 0) {
    // First time — create Default campaign and migrate legacy data
    const defaultCampaign = createCampaign('Default');

    // Migrate legacy contacts
    try {
      const legacyContacts = localStorage.getItem(LEGACY_CONTACTS_KEY);
      if (legacyContacts) {
        localStorage.setItem(`sales-assistant-contacts-${defaultCampaign.id}`, legacyContacts);
      }
    } catch {}

    // Migrate legacy calls
    try {
      const legacyCalls = localStorage.getItem(LEGACY_CALLS_KEY);
      if (legacyCalls) {
        localStorage.setItem(`sales-assistant-calls-${defaultCampaign.id}`, legacyCalls);
      }
    } catch {}

    // Migrate legacy sessions
    try {
      const legacySessions = localStorage.getItem(LEGACY_SESSIONS_KEY);
      if (legacySessions) {
        localStorage.setItem(`sales-assistant-sessions-${defaultCampaign.id}`, legacySessions);
      }
    } catch {}

    setActiveCampaignId(defaultCampaign.id);
    return defaultCampaign.id;
  }

  // Ensure there's an active campaign
  let activeId = getActiveCampaignId();
  if (!activeId || !campaigns.find(c => c.id === activeId)) {
    activeId = campaigns[0].id;
    setActiveCampaignId(activeId);
  }

  return activeId;
}

// ─── Campaign-Scoped Contacts ────────────────────────────

export function getContacts(campaignId?: string): Contact[] {
  const cid = campaignId || getActiveCampaignId();
  if (!cid) return [];
  try {
    const data = localStorage.getItem(`sales-assistant-contacts-${cid}`);
    const contacts = data ? JSON.parse(data) : [];
    return contacts.map((c: any) => ({ ...c, category: c.category || '' }));
  } catch { return []; }
}

export function saveContacts(contacts: Contact[], campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  if (!cid) return;
  localStorage.setItem(`sales-assistant-contacts-${cid}`, JSON.stringify(contacts));
}

export function updateContact(id: string, updates: Partial<Contact>, campaignId?: string) {
  const contacts = getContacts(campaignId);
  const idx = contacts.findIndex(c => c.id === id);
  if (idx !== -1) {
    contacts[idx] = { ...contacts[idx], ...updates };
    saveContacts(contacts, campaignId);
  }
  return contacts;
}

// ─── Campaign-Scoped Calls ───────────────────────────────

export function getCalls(campaignId?: string): Call[] {
  const cid = campaignId || getActiveCampaignId();
  if (!cid) return [];
  try {
    const data = localStorage.getItem(`sales-assistant-calls-${cid}`);
    const calls = data ? JSON.parse(data) : [];
    return calls.map((c: any) => ({ ...c, call_rating: c.call_rating || 0, session_id: c.session_id || '', category: c.category || '' }));
  } catch { return []; }
}

export function saveCalls(calls: Call[], campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  if (!cid) return;
  localStorage.setItem(`sales-assistant-calls-${cid}`, JSON.stringify(calls));
}

export function addCall(call: Call, campaignId?: string) {
  const calls = getCalls(campaignId);
  calls.push(call);
  saveCalls(calls, campaignId);
}

// ─── Settings (Global, not campaign-scoped) ──────────────

export function getSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    const parsed = data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    
    // Auto-connect Drive if webhook URL or Service Account is present
    if (parsed.driveWebhookUrl || parsed.serviceAccountJson || import.meta.env.VITE_SERVICE_ACCOUNT_JSON) {
      parsed.driveConnected = true;
    }

    // Force default drive folder if none is set
    if (!parsed.driveFolderId) {
      parsed.driveFolderId = '1XBCndWW87aMn3awjocvE8tOtdyGhjw9X';
    }
    
    return parsed;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Helpers ─────────────────────────────────────────────

export function getCampaignLeadCount(campaignId: string): number {
  return getContacts(campaignId).length;
}

export { CAMPAIGN_COLORS };
