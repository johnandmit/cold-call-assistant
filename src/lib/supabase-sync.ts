/**
 * Supabase Sync Layer
 * 
 * Architecture: localStorage remains the primary fast data source.
 * Supabase is the cloud-of-record that enables cross-device sync.
 * 
 * - On login: pull everything from Supabase → localStorage
 * - On each write: write to localStorage AND push to Supabase (fire-and-forget)
 * - Cross-campaign linking: when a contact is updated, find matching phone
 *   numbers in other campaigns and sync those too.
 */

export { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Contact, Call, Campaign, Session, Profile, CampaignMember } from '@/types';

// ─── Helpers ─────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Sanitize a date value for PostgreSQL TIMESTAMPTZ columns.
 * Converts any parseable date string to ISO 8601 UTC format.
 * Returns null for empty, falsy, or unparseable values.
 */
function toIsoOrNull(value: any): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  // Already ISO 8601 with Z suffix — pass through
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*Z$/.test(str)) return str;
  // Try to parse and convert to ISO
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function log(msg: string, ...args: any[]) {
  console.log(`[sync] ${msg}`, ...args);
}

/**
 * Global error reporting helper
 */
function reportError(err: any) {
  const msg = err?.message || err?.toString() || 'Unknown sync error';
  window.dispatchEvent(new CustomEvent('sync-error', { detail: msg }));
}

// ─── Pull (Supabase → localStorage) ─────────────────────

/**
 * Called once on login. Downloads all user data from Supabase into localStorage.
 * Returns true if data was found and hydrated.
 */
export async function pullFromSupabase(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  
  try {
    log('Pulling data for user', userId);

    // 0. Preliminary Repair Check (Ensure every campaign has an owner)
    // This promotes the oldest person if no admin is found.
    try {
      await supabase.rpc('repair_campaign_admin_status');
    } catch (e) {
      log('Repair RPC failed (might not be installed yet), skipping...', e);
    }

    // 1. Campaigns
    // We now rely purely on RLS to filter campaigns we own or are members of.
    // We join with campaign_members to see our role, and join with the owner profile.
    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_members!inner(role),
        owner:profiles(email, display_name)
      `)
      .eq('campaign_members.user_id', userId);
    
    if (campErr) throw campErr;
    if (!campaigns || campaigns.length === 0) {
      log('No campaigns found in cloud — fresh user');
      return false;
    }

    // Map Supabase campaigns to local format and save
    const localCampaigns: Campaign[] = campaigns.map(c => {
      // Find the membership for the current user to get the role
      const myMembership = (c as any).campaign_members?.find((m: any) => m.user_id === userId) 
                        || (c as any).campaign_members?.[0]; // Fallback to first if find fails
      
      // authoritative check: if I am the user_id in the campaigns table, I am an admin.
      const isAuthoritativeOwner = c.user_id === userId;
      
      return {
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        color: c.color || '#6366f1',
        role: (isAuthoritativeOwner ? 'owner' : (myMembership?.role || 'member')) as 'owner' | 'member',
        ownerId: (c as any).user_id,
        ownerEmail: (c as any).owner?.email,
        ownerName: (c as any).owner?.display_name,
      };
    });
    localStorage.setItem('sales-assistant-campaigns', JSON.stringify(localCampaigns));

    // Update last active in profile
    await updateLastActive(userId);

    // 2. For each campaign, pull contacts, calls, sessions
    for (const campaign of campaigns) {
      // Contacts — ALWAYS write to localStorage (even if empty, to sync deletions)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('*, profiles:assigned_user_id(email, full_name)')
        .eq('campaign_id', campaign.id);
      
      const localContacts: Contact[] = (contacts || []).map(c => ({
        id: c.id,
        name: c.name || '',
        phone: c.phone || '',
        address: c.address || '',
        website: c.website || '',
        google_maps_url: c.google_maps_url || '',
        rating: Number(c.rating) || 0,
        review_count: c.review_count || 0,
        conversion_confidence_score: Number(c.conversion_confidence_score) || 0,
        outreach_tier: c.outreach_tier || 3,
        average_urgency: c.average_urgency || '',
        opening_hours: c.opening_hours || '',
        notes: c.notes || '',
        called: c.called || false,
        call_date: c.call_date || '',
        call_recording_drive_url: c.call_recording_drive_url || '',
        not_interested: c.not_interested || false,
        follow_up_date: c.follow_up_date || '',
        call_outcome: c.call_outcome || '',
        suppressed_until: c.suppressed_until || '',
        category: c.category || '',
        hidden_from_queue: c.hidden_from_queue || false,
        last_called_at: c.last_called_at || '',
        assigned_user_id: c.assigned_user_id,
        assigned_user_email: c.assigned_user_email || (c as any).profiles?.email,
        assigned_user_name: c.assigned_user_name || (c as any).profiles?.display_name || (c as any).profiles?.full_name,
      }));
      localStorage.setItem(`sales-assistant-contacts-${campaign.id}`, JSON.stringify(localContacts));

      // Calls
      const { data: calls } = await supabase
        .from('calls')
        .select('*')
        .eq('campaign_id', campaign.id);
      
      const localCalls: Call[] = (calls || []).map(c => ({
        id: c.id,
        contact_id: c.contact_id || '',
        contact_name: c.contact_name || '',
        started_at: c.started_at || '',
        ended_at: c.ended_at || '',
        duration_seconds: c.duration_seconds || 0,
        transcript: c.transcript || '',
        recording_filename: c.recording_filename || '',
        recording_drive_url: c.recording_drive_url || '',
        notes: c.notes || '',
        actions_taken: c.actions_taken || [],
        call_rating: c.call_rating || 0,
        call_success: c.call_success,
        session_id: c.session_id || '',
        category: c.category || '',
      }));
      localStorage.setItem(`sales-assistant-calls-${campaign.id}`, JSON.stringify(localCalls));

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*, profiles(email)')
        .eq('campaign_id', campaign.id);
      
      const localSessions: Session[] = (sessions || []).map(s => ({
        id: s.id,
        name: s.name || '',
        startedAt: s.started_at || '',
        endedAt: s.ended_at || '',
        callsMade: s.calls_made || 0,
        outcomes: s.outcomes || {},
        userId: s.user_id,
        userEmail: (s as any).profiles?.email,
      }));
      localStorage.setItem(`sales-assistant-sessions-${campaign.id}`, JSON.stringify(localSessions));
    }

    // Set active campaign
    const settings = JSON.parse(localStorage.getItem('sales-assistant-settings') || '{}');
    if (!settings.activeCampaignId || !campaigns.find((c: any) => c.id === settings.activeCampaignId)) {
      settings.activeCampaignId = campaigns[0].id;
      localStorage.setItem('sales-assistant-settings', JSON.stringify(settings));
    }

    log('Pull complete — hydrated', campaigns.length, 'campaigns');
    return true;
  } catch (err) {
    console.error('[sync] Pull failed:', err);
    reportError(err);
    return false;
  }
}

/**
 * Real-time listener for membership changes.
 * This ensures that if the user is added to a campaign or promoted to owner 
 * on another device, the local app reacts immediately.
 */
export function subscribeToMemberships(userId: string) {
  if (!isSupabaseConfigured || !userId) return null;

  return supabase
    .channel('membership-changes')
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'campaign_members',
        filter: `user_id=eq.${userId}` 
      },
      (payload) => {
        log('Membership changed in cloud, pulling fresh data...');
        pullFromSupabase(userId).then(() => {
          window.dispatchEvent(new Event('campaign-changed'));
        });
      }
    )
    .subscribe();
}

/**
 * Granular sync helper to update a single item in a localStorage array
 */
function updateLocalItem<T extends { id: string }>(key: string, item: T, isDelete: boolean = false) {
  try {
    const raw = localStorage.getItem(key);
    let items: T[] = raw ? JSON.parse(raw) : [];
    
    if (isDelete) {
      items = items.filter(i => i.id !== item.id);
    } else {
      const index = items.findIndex(i => i.id === item.id);
      if (index > -1) {
        items[index] = { ...items[index], ...item };
      } else {
        items.push(item);
      }
    }
    
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch (err) {
    console.error(`[sync] Failed to update local item for key ${key}:`, err);
    return false;
  }
}

/**
 * Initializes granular real-time sync for contacts and calls.
 * This is much more efficient than the "pull everything" approach.
 */
export function initRealtimeSync(userId: string, campaignId: string) {
  if (!isSupabaseConfigured || !userId || !campaignId) return null;

  log(`Initializing realtime sync for campaign ${campaignId}`);

  const channel = supabase.channel(`sync-${campaignId}`)
    // 1. Contacts
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'contacts',
        filter: `campaign_id=eq.${campaignId}` 
      },
      (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const contactId = eventType === 'DELETE' ? oldRow.id : newRow.id;
        log(`Contact ${eventType}: ${contactId}`);

        if (eventType === 'DELETE') {
          updateLocalItem(`sales-assistant-contacts-${campaignId}`, { id: contactId }, true);
        } else {
          const contact: Contact = {
            id: newRow.id,
            name: newRow.name || '',
            phone: newRow.phone || '',
            address: newRow.address || '',
            website: newRow.website || '',
            google_maps_url: newRow.google_maps_url || '',
            rating: Number(newRow.rating) || 0,
            review_count: newRow.review_count || 0,
            conversion_confidence_score: Number(newRow.conversion_confidence_score) || 0,
            outreach_tier: newRow.outreach_tier || 3,
            average_urgency: newRow.average_urgency || '',
            opening_hours: newRow.opening_hours || '',
            notes: newRow.notes || '',
            called: newRow.called || false,
            call_date: newRow.call_date || '',
            call_recording_drive_url: newRow.call_recording_drive_url || '',
            not_interested: newRow.not_interested || false,
            follow_up_date: newRow.follow_up_date || '',
            call_outcome: newRow.call_outcome || '',
            suppressed_until: newRow.suppressed_until || '',
            category: newRow.category || '',
            hidden_from_queue: newRow.hidden_from_queue || false,
            last_called_at: newRow.last_called_at || '',
            assigned_user_id: newRow.assigned_user_id || undefined,
            assigned_user_name: newRow.assigned_user_name || undefined,
            assigned_user_email: newRow.assigned_user_email || undefined,
          };
          updateLocalItem(`sales-assistant-contacts-${campaignId}`, contact);
        }
        window.dispatchEvent(new Event('contacts-changed'));
        window.dispatchEvent(new Event('storage'));
      }
    )
    // 2. Calls
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'calls',
        filter: `campaign_id=eq.${campaignId}` 
      },
      (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const callId = eventType === 'DELETE' ? oldRow.id : newRow.id;
        log(`Call ${eventType}: ${callId}`);

        if (eventType === 'DELETE') {
          updateLocalItem(`sales-assistant-calls-${campaignId}`, { id: callId }, true);
        } else {
          const call: Call = {
            id: newRow.id,
            contact_id: newRow.contact_id || '',
            contact_name: newRow.contact_name || '',
            started_at: newRow.started_at || '',
            ended_at: newRow.ended_at || '',
            duration_seconds: newRow.duration_seconds || 0,
            transcript: newRow.transcript || '',
            recording_filename: newRow.recording_filename || '',
            recording_drive_url: newRow.recording_drive_url || '',
            notes: newRow.notes || '',
            actions_taken: newRow.actions_taken || [],
            call_rating: newRow.call_rating || 0,
            call_success: newRow.call_success,
            session_id: newRow.session_id || '',
            category: newRow.category || '',
          };
          updateLocalItem(`sales-assistant-calls-${campaignId}`, call);
        }
        window.dispatchEvent(new Event('storage'));
      }
    )
    .subscribe();

  return channel;
}

// ─── Push functions (localStorage → Supabase) ───────────

/** Push all campaigns for the current user */
export async function pushCampaigns(userId: string, campaigns: Campaign[]) {
  if (!isSupabaseConfigured) return;
  try {
    for (const c of campaigns) {
      // 1. Only push campaigns we own
      if (c.role !== 'owner') continue; 
      
      // 2. Extra safety: if we have an ownerId and it doesn't match the active user, do NOT push.
      // This prevents RLS violations if local storage is stale or contains data from another account.
      if (c.ownerId && c.ownerId !== userId) {
        log(`Skipping sync for campaign ${c.name} - owner mismatch`);
        continue;
      }

      log(`Pushing campaign metadata: ${c.name}`);
      const { error } = await supabase.from('campaigns').upsert({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        created_at: toIsoOrNull(c.createdAt),
      }, { onConflict: 'id' });
      
      if (error) {
        // If it's an RLS violation, it's likely because we don't actually own this ID in the DB
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          log(`RLS Violation for ${c.name}. Local state says owner, but DB disagrees. Skipping.`);
          continue;
        }
        throw error;
      }

      // Ensure ownership membership exists via direct upsert (RPC was missing from schema)
      const { error: memberErr } = await supabase.from('campaign_members').upsert({
        campaign_id: c.id,
        user_id: userId,
        role: 'owner'
      }, { onConflict: 'campaign_id,user_id' });
      
      if (memberErr) log('Failed to ensure owner membership (maybe already exists)', memberErr.message);
    }
  } catch (err: any) {
    console.error('[sync] pushCampaigns failed:', err);
    window.dispatchEvent(new CustomEvent('sync-error', { detail: err.message || err.toString() }));
  }
}

/** Push contacts for a specific campaign (full sync: upsert + delete stale) */
export async function pushContacts(userId: string, campaignId: string, contacts: Contact[]) {
  if (!isSupabaseConfigured) return;
  try {
    const localIds = new Set(contacts.map(c => c.id));

    // 1. Upsert all local contacts
    if (contacts.length > 0) {
      const rows = contacts.map(c => ({
        id: c.id,
        campaign_id: campaignId,
        user_id: userId,
        name: c.name,
        phone: c.phone,
        address: c.address,
        website: c.website,
        google_maps_url: c.google_maps_url,
        rating: c.rating,
        review_count: c.review_count,
        conversion_confidence_score: c.conversion_confidence_score,
        outreach_tier: c.outreach_tier,
        average_urgency: c.average_urgency,
        opening_hours: c.opening_hours,
        notes: c.notes,
        called: c.called,
        call_date: toIsoOrNull(c.call_date),
        call_recording_drive_url: c.call_recording_drive_url,
        not_interested: c.not_interested,
        follow_up_date: toIsoOrNull(c.follow_up_date),
        call_outcome: c.call_outcome,
        suppressed_until: toIsoOrNull(c.suppressed_until),
        category: c.category,
        hidden_from_queue: c.hidden_from_queue || false,
        assigned_user_id: c.assigned_user_id,
        assigned_user_name: c.assigned_user_name,
        assigned_user_email: c.assigned_user_email,
        last_called_at: toIsoOrNull(c.last_called_at),
      }));

      // Batch upsert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from('contacts').upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
      }
    }

    // 2. Delete cloud contacts that no longer exist locally
    // Fetch all contact IDs for this campaign from the cloud
    const { data: cloudContacts, error: fetchErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('campaign_id', campaignId);

    if (!fetchErr && cloudContacts) {
      const toDelete = cloudContacts
        .map(c => c.id)
        .filter(id => !localIds.has(id));

      if (toDelete.length > 0) {
        // Delete in batches of 500
        for (let i = 0; i < toDelete.length; i += 500) {
          const batch = toDelete.slice(i, i + 500);
          await supabase.from('contacts').delete().in('id', batch);
        }
        log(`Deleted ${toDelete.length} stale contacts from cloud`);
      }
    }
  } catch (err: any) {
    console.error('[sync] pushContacts failed:', err);
    window.dispatchEvent(new CustomEvent('sync-error', { detail: err.message || err.toString() }));
  }
}

/** Push a single call record */
export async function pushCall(userId: string, campaignId: string, call: Call) {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('calls').upsert({
      id: call.id,
      campaign_id: campaignId,
      user_id: userId,
      contact_id: call.contact_id,
      contact_name: call.contact_name,
      started_at: toIsoOrNull(call.started_at),
      ended_at: toIsoOrNull(call.ended_at),
      duration_seconds: call.duration_seconds,
      transcript: call.transcript,
      recording_filename: call.recording_filename,
      recording_drive_url: call.recording_drive_url,
      notes: call.notes,
      actions_taken: call.actions_taken,
      call_rating: call.call_rating,
      call_success: call.call_success,
      session_id: call.session_id || null,
      category: call.category,
    }, { onConflict: 'id' });
  } catch (err) {
    console.error('[sync] pushCall failed:', err);
  }
}

/** Push sessions for a campaign */
export async function pushSessions(userId: string, campaignId: string, sessions: Session[]) {
  if (!isSupabaseConfigured) return;
  try {
    const rows = sessions.map(s => ({
      id: s.id,
      campaign_id: campaignId,
      user_id: userId,
      name: s.name,
      started_at: toIsoOrNull(s.startedAt),
      ended_at: toIsoOrNull(s.endedAt),
      calls_made: s.callsMade,
      outcomes: s.outcomes,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await supabase.from('sessions').upsert(chunk, { onConflict: 'id' });
    }
  } catch (err) {
    console.error('[sync] pushSessions failed:', err);
  }
}

/** Delete a campaign from Supabase (cascade takes care of related data) */
export async function deleteCloudCampaign(campaignId: string) {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('campaigns').delete().eq('id', campaignId);
  } catch (err) {
    console.error('[sync] deleteCloudCampaign failed:', err);
  }
}

// ─── Cross-Campaign Contact Linking ─────────────────────

/**
 * When a contact is updated, find all contacts with the same phone number
 * across ALL campaigns and sync the call-related fields to them.
 * This runs in the background (fire-and-forget).
 */
export function syncLinkedContacts(
  updatedContact: Contact,
  updates: Partial<Contact>,
  activeCampaignId: string
) {
  // Only sync call-related fields, not campaign-specific metadata
  const syncableFields: (keyof Contact)[] = [
    'called', 'call_date', 'notes', 'not_interested',
    'follow_up_date', 'call_outcome', 'call_recording_drive_url',
    'hidden_from_queue',
  ];

  const syncUpdates: Partial<Contact> = {};
  for (const field of syncableFields) {
    if (field in updates) {
      (syncUpdates as any)[field] = (updates as any)[field];
    }
  }

  if (Object.keys(syncUpdates).length === 0) return;

  const phone = normalizePhone(updatedContact.phone);
  if (!phone || phone.length < 5) return; // Skip if no meaningful phone

  try {
    // Get all campaigns
    const campaignsRaw = localStorage.getItem('sales-assistant-campaigns');
    if (!campaignsRaw) return;
    const campaigns: Campaign[] = JSON.parse(campaignsRaw);

    for (const campaign of campaigns) {
      if (campaign.id === activeCampaignId) continue; // Skip the source campaign

      const contactsRaw = localStorage.getItem(`sales-assistant-contacts-${campaign.id}`);
      if (!contactsRaw) continue;
      const contacts: Contact[] = JSON.parse(contactsRaw);

      let changed = false;
      for (let i = 0; i < contacts.length; i++) {
        const otherPhone = normalizePhone(contacts[i].phone);
        if (otherPhone && otherPhone === phone) {
          contacts[i] = { ...contacts[i], ...syncUpdates };
          changed = true;
          log(`Linked update: ${updatedContact.name} → ${contacts[i].name} in "${campaign.name}"`);
        }
      }

      if (changed) {
        localStorage.setItem(`sales-assistant-contacts-${campaign.id}`, JSON.stringify(contacts));
      }
    }
  } catch (err) {
    console.error('[sync] syncLinkedContacts failed:', err);
  }
}

/**
 * When a call is added for a contact, duplicate it into any campaigns
 * that have a contact with the same phone number.
 */
export function syncLinkedCall(
  call: Call,
  contactPhone: string,
  activeCampaignId: string
) {
  const phone = normalizePhone(contactPhone);
  if (!phone || phone.length < 5) return;

  try {
    const campaignsRaw = localStorage.getItem('sales-assistant-campaigns');
    if (!campaignsRaw) return;
    const campaigns: Campaign[] = JSON.parse(campaignsRaw);

    for (const campaign of campaigns) {
      if (campaign.id === activeCampaignId) continue;

      const contactsRaw = localStorage.getItem(`sales-assistant-contacts-${campaign.id}`);
      if (!contactsRaw) continue;
      const contacts: Contact[] = JSON.parse(contactsRaw);

      // Find matching contact in this campaign
      const matchingContact = contacts.find(c => normalizePhone(c.phone) === phone);
      if (!matchingContact) continue;

      // Add the call to this campaign's call list (with updated contact_id)
      const callsRaw = localStorage.getItem(`sales-assistant-calls-${campaign.id}`);
      const calls: Call[] = callsRaw ? JSON.parse(callsRaw) : [];

      // Don't duplicate if already exists
      if (calls.find(c => c.id === call.id)) continue;

      const linkedCall: Call = {
        ...call,
        contact_id: matchingContact.id,
        contact_name: matchingContact.name,
      };
      calls.push(linkedCall);
      localStorage.setItem(`sales-assistant-calls-${campaign.id}`, JSON.stringify(calls));

      log(`Linked call duplicated to "${campaign.name}" for ${matchingContact.name}`);
    }
  } catch (err) {
    console.error('[sync] syncLinkedCall failed:', err);
  }
}

// ─── Full Push (push everything to Supabase) ────────────

/**
 * Push ALL local data to Supabase. Called after initial setup or manual sync.
 */
export async function pushAllToSupabase(userId: string) {
  if (!isSupabaseConfigured) return;

  try {
    log('Full push starting for user', userId);

    // Get campaigns
    const campaignsRaw = localStorage.getItem('sales-assistant-campaigns');
    if (!campaignsRaw) return;
    const campaigns: Campaign[] = JSON.parse(campaignsRaw);
    await pushCampaigns(userId, campaigns);

    // For each campaign, push everything
    for (const campaign of campaigns) {
      const contactsRaw = localStorage.getItem(`sales-assistant-contacts-${campaign.id}`);
      if (contactsRaw) {
        const contacts: Contact[] = JSON.parse(contactsRaw);
        await pushContacts(userId, campaign.id, contacts);
      }

      const callsRaw = localStorage.getItem(`sales-assistant-calls-${campaign.id}`);
      if (callsRaw) {
        const calls: Call[] = JSON.parse(callsRaw);
        for (const call of calls) {
          await pushCall(userId, campaign.id, call);
        }
      }

      const sessionsRaw = localStorage.getItem(`sales-assistant-sessions-${campaign.id}`);
      if (sessionsRaw) {
        const sessions: Session[] = JSON.parse(sessionsRaw);
        await pushSessions(userId, campaign.id, sessions);
      }
    }

    log('Full push complete');
  } catch (err) {
    console.error('[sync] pushAllToSupabase failed:', err);
  }
}

/**
 * Join an existing campaign by its UUID.
 * This adds the current user to the campaign_members table.
 */
export async function joinCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) return { success: false, message: 'Cloud sync not configured' };
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { success: false, message: 'Not logged in' };

    // Trim the input just in case
    const cleanId = campaignId.trim();
    if (!cleanId || cleanId.length < 10) return { success: false, message: 'Invalid Campaign ID' };

    // Verify campaign actually exists first (this also verifies if our RLS allows us to see it post-join, though pre-join we can't select it. 
    // Wait: If we aren't a member yet, we can't see the campaign. We just have to blindly insert into campaign_members!
    const { error: joinErr } = await supabase.from('campaign_members').insert({
      campaign_id: cleanId,
      user_id: session.user.id,
      role: 'member'
    });

    if (joinErr) {
      if (joinErr.code === '23505') {
        return { success: true, message: 'Already a member of this campaign!' };
      }
      if (joinErr.code === '23503') {
         return { success: false, message: 'Campaign not found (Invalid ID)' };
      }
      throw joinErr;
    }

    // Success! Pull everything immediately
    await pullFromSupabase(session.user.id);
    return { success: true, message: 'Successfully joined campaign!' };

  } catch (err: any) {
    console.error('[sync] joinCampaign failed:', err);
    return { success: false, message: err.message || 'Failed to join campaign' };
  }
}

/**
 * Updates the user's last active timestamp in their profile.
 */
export async function updateLastActive(userId: string) {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId);
  } catch (err) {
    console.warn('[sync] Failed to update last_active:', err);
  }
}

/**
 * Fetches all members of a campaign with their roles and profile info.
 */
export async function fetchCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase.rpc('get_campaign_members_with_stats', { p_campaign_id: campaignId });
    
    if (error) {
      // Fallback if RPC isn't installed yet: use the view
      const { data: viewData, error: viewErr } = await supabase
        .from('campaign_member_details')
        .select('*')
        .eq('campaign_id', campaignId);
      
      if (viewErr) throw viewErr;
      return (viewData || []).map(m => ({
        id: m.user_id,
        email: m.email,
        role: m.role,
        joined_at: m.joined_at,
        last_active: m.last_active,
        total_calls: 0,
      }));
    }
    
    return data || [];
  } catch (err) {
    console.error('[sync] fetchCampaignMembers failed:', err);
    return [];
  }
}

/**
 * Transfers ownership of a campaign to a new user.
 * This demotes the current owner to a member and promotes the target to owner.
 * Also updates the user_id in the campaigns table.
 */
export async function transferOwnership(campaignId: string, newOwnerId: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) return { success: false, message: 'Cloud sync not configured' };
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: 'Not logged in' };

    // 1. Verify we are the owner
    const { data: campaign } = await supabase.from('campaigns').select('user_id').eq('id', campaignId).single();
    if (campaign?.user_id !== user.id) return { success: false, message: 'Only the current owner can transfer ownership' };

    // 2. Perform the swap
    // First, demote self
    await supabase.from('campaign_members').update({ role: 'member' }).match({ campaign_id: campaignId, user_id: user.id });
    
    // Second, promote new owner
    await supabase.from('campaign_members').update({ role: 'owner' }).match({ campaign_id: campaignId, user_id: newOwnerId });
    
    // Third, update the campaign itself
    await supabase.from('campaigns').update({ user_id: newOwnerId }).eq('id', campaignId);

    // CRITICAL: Immediately pull the new state from cloud to update local role
    await pullFromSupabase(user.id);
    window.dispatchEvent(new Event('campaign-changed'));

    return { success: true, message: 'Ownership transferred successfully' };
  } catch (err: any) {
    console.error('[sync] transferOwnership failed:', err);
    return { success: false, message: err.message || 'Transfer failed' };
  }
}

/**
 * Fetches user profile data from Supabase.
 */
export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[sync] fetchUserProfile failed:', err);
    return null;
  }
}

/**
 * Updates user profile metadata.
 */
export async function updateUserProfile(userId: string, updates: Partial<Profile>): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) return { success: false, message: 'Cloud sync not configured' };
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    
    if (error) throw error;
    return { success: true, message: 'Profile updated successfully' };
  } catch (err: any) {
    console.error('[sync] updateUserProfile failed:', err);
    return { success: false, message: err.message || 'Update failed' };
  }
}

/**
 * Removes a member from a campaign or lets a member leave.
 * Handles owner succession automatically via RPC.
 */
export async function leaveCampaign(campaignId: string, userId: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) return { success: false, message: 'Cloud sync not configured' };
  
  try {
    const { data, error } = await supabase.rpc('handle_member_leave', {
      p_campaign_id: campaignId,
      p_user_id: userId
    });

    if (error) throw error;
    
    // The RPC returns a JSON object { success, message }
    const result = data as { success: boolean; message: string };
    
    if (result.success) {
      // Refresh local state
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await pullFromSupabase(user.id);
      window.dispatchEvent(new Event('campaign-changed'));
    }

    return result;
  } catch (err: any) {
    console.error('[sync] leaveCampaign failed:', err);
    return { success: false, message: err.message || 'Action failed' };
  }
}
