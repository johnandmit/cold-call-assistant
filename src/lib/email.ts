/**
 * Email Service — n8n webhook integration for post-call follow-up emails.
 * 
 * Flow:
 * 1. After a call, PostCallModal collects recipient email + sender account
 * 2. CallScreen fires sendToWebhook() with all call data
 * 3. n8n composes an email and returns { subject, body }
 * 4. The result is saved as a PendingEmail in localStorage
 * 5. User reviews/edits/sends on the /emails page
 */

import { v4 } from '@/lib/uuid';
import { getSettings } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/types';

// ─── Types ───────────────────────────────────────────────

export type SenderAccount = 'john' | 'silva';

export interface PendingEmail {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;       // Recipient email
  contactWebsite: string;
  contactAddress: string;
  senderAccount: SenderAccount;
  callNotes: string;
  callOutcome: string;
  callDate: string;
  campaignId: string;
  campaignName: string;
  subject: string;            // Composed by n8n
  body: string;               // Composed by n8n
  status: 'generating' | 'pending' | 'sent' | 'skipped' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  inclusions?: string;
}

export interface WebhookPayload {
  notes: string;
  recipientEmail: string;
  recipientName: string;
  senderAccount: SenderAccount;
  contactPhone: string;
  contactWebsite: string;
  contactAddress: string;
  callOutcome: string;
  callDate: string;
  campaignName: string;
  // Regeneration
  feedback?: string;
  previousSubject?: string;
  previousBody?: string;
  inclusions?: string;
  systemPrompt?: string;
}

export interface WebhookResponse {
  subject: string;
  body: string;
}

// ─── Webhook ─────────────────────────────────────────────

const WEBHOOK_URL = 'https://n8n.arfquant.com/webhook/SendInfoEmail';

/**
 * Send call data to the n8n webhook for email composition.
 * Returns the composed subject + body.
 */
export async function sendToWebhook(payload: WebhookPayload): Promise<WebhookResponse> {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Normalize response — n8n might return various structures
  return {
    subject: data.subject || data.Subject || data.output?.Subject || data.output?.subject || 'Follow-up from our call',
    body: data.body || data.Body || data.message || data.email || data.output?.Body || data.output?.body || '',
  };
}

/**
 * Regenerate an email by re-sending to webhook with feedback.
 */
export async function regenerateEmail(
  pendingEmail: PendingEmail,
  feedback: string,
): Promise<WebhookResponse> {
  const payload: WebhookPayload = {
    notes: pendingEmail.callNotes,
    recipientEmail: pendingEmail.contactEmail,
    recipientName: pendingEmail.contactName,
    senderAccount: pendingEmail.senderAccount,
    contactPhone: pendingEmail.contactPhone,
    contactWebsite: pendingEmail.contactWebsite,
    contactAddress: pendingEmail.contactAddress,
    callOutcome: pendingEmail.callOutcome,
    callDate: pendingEmail.callDate,
    campaignName: pendingEmail.campaignName,
    // Regeneration context
    feedback,
    previousSubject: pendingEmail.subject,
    previousBody: pendingEmail.body,
    inclusions: pendingEmail.inclusions,
    systemPrompt: getSettings().emailSystemPrompt || DEFAULT_SETTINGS.emailSystemPrompt,
  };

  return sendToWebhook(payload);
}

// ─── localStorage CRUD ───────────────────────────────────

function getStorageKey(campaignId: string): string {
  return `sales-assistant-emails-${campaignId}`;
}

export function getPendingEmails(campaignId: string): PendingEmail[] {
  try {
    const data = localStorage.getItem(getStorageKey(campaignId));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveEmails(campaignId: string, emails: PendingEmail[]): void {
  localStorage.setItem(getStorageKey(campaignId), JSON.stringify(emails));
}

/**
 * Create a new pending email entry (initially in 'generating' status).
 * Returns the created email's ID so the caller can update it when the webhook responds.
 */
export function createPendingEmail(
  params: Omit<PendingEmail, 'id' | 'subject' | 'body' | 'status' | 'createdAt' | 'updatedAt'>
): PendingEmail {
  const now = new Date().toISOString();
  const email: PendingEmail = {
    ...params,
    id: v4(),
    subject: '',
    body: '',
    status: 'generating',
    createdAt: now,
    updatedAt: now,
  };

  const emails = getPendingEmails(params.campaignId);
  emails.unshift(email); // newest first
  saveEmails(params.campaignId, emails);

  return email;
}

/**
 * Update a pending email (e.g. after webhook response, user edits, status change).
 */
export function updatePendingEmail(
  campaignId: string,
  emailId: string,
  updates: Partial<PendingEmail>,
): PendingEmail | null {
  const emails = getPendingEmails(campaignId);
  const idx = emails.findIndex(e => e.id === emailId);
  if (idx === -1) return null;

  emails[idx] = {
    ...emails[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveEmails(campaignId, emails);
  return emails[idx];
}

/**
 * Delete a pending email permanently.
 */
export function deletePendingEmail(campaignId: string, emailId: string): void {
  const emails = getPendingEmails(campaignId).filter(e => e.id !== emailId);
  saveEmails(campaignId, emails);
}

/**
 * Get count of pending (unreviewed) emails for badge display.
 */
export function getPendingEmailCount(campaignId: string): number {
  return getPendingEmails(campaignId).filter(e => e.status === 'pending' || e.status === 'generating').length;
}

/**
 * Fire-and-forget: Create a pending email, send to webhook, update with response.
 * Used from CallScreen's handlePostCallDone.
 */
export async function queueEmailForReview(params: {
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactWebsite: string;
  contactAddress: string;
  senderAccount: SenderAccount;
  callNotes: string;
  callOutcome: string;
  callDate: string;
  campaignId: string;
  campaignName: string;
  inclusions?: string;
}): Promise<PendingEmail> {
  // 1. Create the pending entry immediately (shows as 'generating')
  const pendingEmail = createPendingEmail(params);

  // 2. Fire webhook (async — don't block the call flow)
  try {
    const payload: WebhookPayload = {
      notes: params.callNotes || 'No notes taken during call.',
      recipientEmail: params.contactEmail || 'placeholder@example.com',
      recipientName: params.contactName || 'Valued Client',
      senderAccount: params.senderAccount,
      contactPhone: params.contactPhone || 'N/A',
      contactWebsite: params.contactWebsite || 'N/A',
      contactAddress: params.contactAddress || 'N/A',
      callOutcome: params.callOutcome || 'completed',
      callDate: params.callDate || new Date().toISOString(),
      campaignName: params.campaignName || 'Default Campaign',
      inclusions: params.inclusions,
      systemPrompt: getSettings().emailSystemPrompt || DEFAULT_SETTINGS.emailSystemPrompt,
    };

    const response = await sendToWebhook(payload);

    // 3. Update with the composed email
    const updated = updatePendingEmail(params.campaignId, pendingEmail.id, {
      subject: response.subject,
      body: response.body,
      status: 'pending',
    });

    return updated || pendingEmail;
  } catch (err: any) {
    // Mark as error but keep it — user can retry from the review page
    updatePendingEmail(params.campaignId, pendingEmail.id, {
      status: 'error',
      errorMessage: err.message || 'Webhook failed',
    });
    throw err;
  }
}
