import { Contact, Call, Settings, DEFAULT_SETTINGS, Campaign } from '@/types';
import { v4 } from '@/lib/uuid';
import {
  pushCampaigns, pushContacts, pushCall, deleteCloudCampaign,
  syncLinkedContacts, syncLinkedCall,
} from '@/lib/supabase-sync';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const CAMPAIGNS_KEY = 'sales-assistant-campaigns';
const SETTINGS_KEY = 'sales-assistant-settings';
const FOLDERS_KEY = 'sales-assistant-folders';

// Legacy keys (pre-campaign)
const LEGACY_CONTACTS_KEY = 'sales-assistant-contacts';
const LEGACY_CALLS_KEY = 'sales-assistant-calls';
const LEGACY_SESSIONS_KEY = 'sales-assistant-sessions';

const CAMPAIGN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

// ─── Sync Helpers ────────────────────────────────────────

/** Get the current authenticated user ID from the Supabase client directly */
async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || '';
}

/** Fire-and-forget push campaigns to Supabase */
async function bgPushCampaigns() {
  const uid = await getUserId();
  if (!uid) return;
  const campaigns = getCampaigns();
  
  // Extra safety: only push campaigns where role is explicitly 'owner' 
  // to avoid RLS issues for shared campaigns in the same loop
  const ownedCampaigns = campaigns.filter(c => c.role === 'owner');
  if (ownedCampaigns.length === 0) return;
  
  pushCampaigns(uid, ownedCampaigns).catch((err) => {
    console.warn('[sync] Background campaign sync failed:', err);
  });
}

/** Fire-and-forget push contacts to Supabase */
async function bgPushContacts(campaignId: string) {
  const uid = await getUserId();
  if (!uid) return;
  
  // Safety: Ensure campaign membership exists before pushing contacts
  // This fixes campaigns that were created when the RPC was missing
  const campaigns = getCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);
  if (campaign && campaign.role === 'owner') {
    await pushCampaigns(uid, [campaign]).catch(() => {});
  }

  const contacts = getContacts(campaignId);
  pushContacts(uid, campaignId, contacts).catch(() => {});
}

// ─── Campaigns ───────────────────────────────────────────

export function getCampaigns(): Campaign[] {
  try {
    const data = localStorage.getItem(CAMPAIGNS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveCampaigns(campaigns: Campaign[], sync: boolean = true) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
  if (sync) {
    bgPushCampaigns();
  }
}

export function createCampaign(name: string, color?: string): Campaign {
  const campaigns = getCampaigns();
  const campaign: Campaign = {
    id: v4(),
    name,
    createdAt: new Date().toISOString(),
    color: color || CAMPAIGN_COLORS[campaigns.length % CAMPAIGN_COLORS.length],
    role: 'owner',
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

export function moveCampaignToFolder(campaignId: string, folderId: string | null) {
  const campaigns = getCampaigns();
  const idx = campaigns.findIndex(c => c.id === campaignId);
  if (idx !== -1) {
    campaigns[idx].folderId = folderId;
    saveCampaigns(campaigns, false); // Folders are local-only
  }
}

export function deleteCampaign(id: string) {
  const campaigns = getCampaigns().filter(c => c.id !== id);
  saveCampaigns(campaigns);
  // Clean up campaign data
  localStorage.removeItem(`sales-assistant-contacts-${id}`);
  localStorage.removeItem(`sales-assistant-calls-${id}`);
  localStorage.removeItem(`sales-assistant-sessions-${id}`);
  // Also delete from cloud
  deleteCloudCampaign(id).catch(() => {});
}

// ─── Folders (Client-side Only) ──────────────────────────

export function getFolders(): Folder[] {
  try {
    const data = localStorage.getItem(FOLDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveFolders(folders: Folder[]) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export function createFolder(name: string): Folder {
  const folders = getFolders();
  const folder: Folder = {
    id: v4(),
    name,
    createdAt: new Date().toISOString(),
  };
  folders.push(folder);
  saveFolders(folders);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const folders = getFolders();
  const idx = folders.findIndex(f => f.id === id);
  if (idx !== -1) {
    folders[idx].name = name;
    saveFolders(folders);
  }
}

export function deleteFolder(id: string) {
  const folders = getFolders().filter(f => f.id !== id);
  saveFolders(folders);
  
  // Unassign campaigns from this folder
  const campaigns = getCampaigns();
  let changed = false;
  campaigns.forEach(c => {
    if (c.folderId === id) {
      c.folderId = null;
      changed = true;
    }
  });
  if (changed) saveCampaigns(campaigns, false); // Folders are local-only
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
    let contacts: Contact[] = data ? JSON.parse(data) : [];
    contacts = contacts.map((c: any) => ({ ...c, category: c.category || '' }));

    // Auto-deduplicate by phone number (cleans up legacy duplicate imports)
    const normalizePhone = (p: string) => p.replace(/\D/g, '');
    const byPhone = new Map<string, Contact>();
    let hadDupes = false;

    for (const c of contacts) {
      const p = normalizePhone(c.phone);
      if (!p) {
        // Keep contacts with empty phones as-is (keyed by id)
        byPhone.set(`__id_${c.id}`, c);
        continue;
      }
      const existing = byPhone.get(p);
      if (!existing) {
        byPhone.set(p, c);
      } else {
        hadDupes = true;
        // Merge: keep the version with more data (prefer existing call data)
        byPhone.set(p, {
          ...c,
          ...existing,
          // Preserve whichever has the actual data
          notes: (existing.notes || '').length >= (c.notes || '').length ? existing.notes : c.notes,
          called: existing.called || c.called,
          call_date: existing.call_date || c.call_date,
          call_outcome: existing.call_outcome || c.call_outcome,
          follow_up_date: existing.follow_up_date || c.follow_up_date,
          not_interested: existing.not_interested || c.not_interested,
          hidden_from_queue: existing.hidden_from_queue || c.hidden_from_queue,
          call_recording_drive_url: existing.call_recording_drive_url || c.call_recording_drive_url,
          last_called_at: existing.last_called_at || c.last_called_at,
          assigned_user_id: existing.assigned_user_id || c.assigned_user_id,
          assigned_user_email: existing.assigned_user_email || c.assigned_user_email,
          assigned_user_name: existing.assigned_user_name || c.assigned_user_name,
          address: existing.address || c.address,
          website: existing.website || c.website,
          google_maps_url: existing.google_maps_url || c.google_maps_url,
          rating: existing.rating || c.rating,
          review_count: existing.review_count || c.review_count,
          conversion_confidence_score: existing.conversion_confidence_score || c.conversion_confidence_score,
          category: existing.category || c.category,
        });
      }
    }

    if (hadDupes) {
      const cleaned = Array.from(byPhone.values());
      // Write back silently (no cloud push — just local cleanup)
      localStorage.setItem(`sales-assistant-contacts-${cid}`, JSON.stringify(cleaned));
      console.log(`[storage] Auto-deduped contacts for campaign ${cid}: ${contacts.length} → ${cleaned.length}`);
      return cleaned;
    }

    return contacts;
  } catch { return []; }
}

export function saveContacts(contacts: Contact[], campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  if (!cid) return;
  try {
    localStorage.setItem(`sales-assistant-contacts-${cid}`, JSON.stringify(contacts));
    bgPushContacts(cid);
  } catch (err: any) {
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      window.dispatchEvent(new CustomEvent('sync-error', { 
        detail: 'Browser storage is full! Use a smaller CSV or delete old campaigns.' 
      }));
    }
    console.error('[storage] Failed to save contacts:', err);
  }
}

export function updateContact(id: string, updates: Partial<Contact>, campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  const contacts = getContacts(cid);
  const idx = contacts.findIndex(c => c.id === id);
  if (idx !== -1) {
    const updatedContact = { ...contacts[idx], ...updates };
    contacts[idx] = updatedContact;
    saveContacts(contacts, cid);

    // Cross-campaign linking: sync call-related fields to matching contacts
    syncLinkedContacts(updatedContact, updates, cid || '');
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

export async function addCall(call: Call, campaignId?: string) {
  const cid = campaignId || getActiveCampaignId();
  const userId = await getUserId();
  const { data: { session } } = await supabase.auth.getSession();
  
  // Attribute the call to the current user
  call.userId = userId;
  call.userEmail = session?.user?.email || '';

  const calls = getCalls(cid);
  calls.push(call);
  saveCalls(calls, cid);

  // Push this call to Supabase
  if (userId && cid) {
    pushCall(userId, cid, call).catch(() => {});
  }

  // Automatically assign lead ownership on call completion
  const contacts = getContacts(cid);
  const contact = contacts.find(c => c.id === call.contact_id);
  if (contact && cid && userId) {
    // We use the user's email or display name for the 'Called by' badge
    const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || 'Member';
    
    updateContact(contact.id, {
      assigned_user_id: userId,
      assigned_user_email: session?.user?.email || '',
      assigned_user_name: displayName
    }, cid);

    // Cross-campaign linking: duplicate call to campaigns with matching phone
    syncLinkedCall(call, contact.phone, cid);
  }
}

// ─── Settings (Global, not campaign-scoped) ──────────────

export function getSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    const parsed = data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    
    // Drive is now connected by default via hardcoded Apps Script URL
    parsed.driveConnected = true;

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
