/**
 * Contact Locking System
 *
 * Prevents two users from calling the same lead simultaneously.
 * Uses Supabase as the source of truth for lock state.
 * Locks by PHONE NUMBER (not contact ID) so it works across users
 * who may have different contact IDs for the same business.
 *
 * Locks auto-expire after 30 minutes (stale browser crash protection).
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LOCK_EXPIRY_MINUTES = 30;
const LOCK_TABLE = 'contact_locks';

export interface ContactLock {
  phone: string;
  lockedBy: string;
  lockedAt: string;
}

/**
 * Normalize phone for comparison (strip non-digits).
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Attempt to lock a contact by phone number.
 * Returns { success: true } if lock acquired, { success: false } if taken.
 */
export async function lockContact(phone: string): Promise<{ success: boolean; lockedBy?: string }> {
  if (!isSupabaseConfigured || !phone) {
    console.warn('[lock] Skipping lock:', !isSupabaseConfigured ? 'no supabase' : 'no phone');
    return { success: true };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return { success: true };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn('[lock] No auth session, skipping lock');
      return { success: true };
    }

    const userId = session.user.id;
    const now = new Date().toISOString();
    const expiryThreshold = new Date(Date.now() - LOCK_EXPIRY_MINUTES * 60 * 1000).toISOString();

    console.log(`[lock] Locking phone "${normalizedPhone}" for user ${userId.slice(0,8)}...`);

    // Check if someone else holds a non-expired lock
    const { data: existing, error: readErr } = await supabase
      .from(LOCK_TABLE)
      .select('locked_by, locked_at')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (readErr) {
      console.error('[lock] Read failed:', readErr.message, readErr);
      return { success: true }; // Fail open
    }

    if (existing?.locked_by && existing.locked_by !== userId) {
      if (existing.locked_at && existing.locked_at > expiryThreshold) {
        console.log(`[lock] ❌ BLOCKED — locked by ${existing.locked_by.slice(0,8)}... at ${existing.locked_at}`);
        return { success: false, lockedBy: existing.locked_by };
      }
      console.log('[lock] Existing lock expired, replacing');
    }

    // Upsert the lock (insert or update)
    const { error: upsertErr } = await supabase
      .from(LOCK_TABLE)
      .upsert({ phone: normalizedPhone, locked_by: userId, locked_at: now }, { onConflict: 'phone' });

    if (upsertErr) {
      console.error('[lock] Upsert failed:', upsertErr.message);
      return { success: true }; // Fail open
    }

    console.log('[lock] ✅ Lock acquired');
    return { success: true };
  } catch (err) {
    console.error('[lock] lockContact error:', err);
    return { success: true }; // Fail open
  }
}

/**
 * Release a lock on a contact by phone number.
 */
export async function unlockContact(phone: string): Promise<void> {
  if (!isSupabaseConfigured || !phone) return;

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    console.log(`[lock] Unlocking phone "${normalizedPhone}"`);

    const { error } = await supabase
      .from(LOCK_TABLE)
      .delete()
      .eq('phone', normalizedPhone)
      .eq('locked_by', session.user.id); // Only delete our own locks

    if (error) {
      console.error('[lock] Unlock failed:', error.message);
    } else {
      console.log('[lock] ✅ Unlocked');
    }
  } catch (err) {
    console.error('[lock] unlockContact error:', err);
  }
}

/**
 * Release all locks held by the current user (e.g. on page unload).
 */
export async function unlockAllMyContacts(): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from(LOCK_TABLE)
      .delete()
      .eq('locked_by', session.user.id);
  } catch (err) {
    console.error('[lock] unlockAllMyContacts error:', err);
  }
}

/**
 * Check lock status of a contact by phone number.
 * Returns the lock info if locked by someone else, or null if free.
 */
export async function checkLock(phone: string): Promise<ContactLock | null> {
  if (!isSupabaseConfigured || !phone) return null;

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const expiryThreshold = new Date(Date.now() - LOCK_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from(LOCK_TABLE)
      .select('phone, locked_by, locked_at')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (error) {
      console.error(`[lock] checkLock error:`, error.message);
      return null;
    }

    if (!data?.locked_by) return null;
    if (data.locked_by === session.user.id) return null; // Our own lock
    if (data.locked_at && data.locked_at < expiryThreshold) return null; // Expired

    console.log(`[lock] ⚠️ Phone ${normalizedPhone} is locked by ${data.locked_by.slice(0,8)}...`);
    return {
      phone: normalizedPhone,
      lockedBy: data.locked_by,
      lockedAt: data.locked_at || '',
    };
  } catch (err) {
    console.error('[lock] checkLock error:', err);
    return null;
  }
}
