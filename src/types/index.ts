export interface Contact {
  id: string;
  name: string;
  phone: string;
  address: string;
  website: string;
  google_maps_url: string;
  rating: number;
  review_count: number;
  conversion_confidence_score: number;
  outreach_tier: number;
  average_urgency: 'High' | 'Medium' | 'Low' | '';
  opening_hours: string;
  notes: string;
  called: boolean;
  call_date: string;
  call_recording_drive_url: string;
  not_interested: boolean;
  follow_up_date: string;
  call_outcome: string;
  suppressed_until: string;
  category: string; // niche/category from CSV
  hidden_from_queue?: boolean; // soft-removed: hidden from queue but kept in CSV
  last_called_at?: string; // ISO date
  assigned_user_id?: string;
  assigned_user_email?: string;
  assigned_user_name?: string;
}

export interface Call {
  id: string;
  contact_id: string;
  contact_name: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  transcript: string;
  recording_filename: string;
  recording_drive_url: string;
  notes: string;
  actions_taken: string[];
  call_rating: number; // 1-5 star rating
  call_success?: boolean; // true = success, false = failed, undefined = not set
  session_id: string; // which session this call belongs to
  category: string; // contact's category/niche
  userId?: string;
  userEmail?: string;
}

export interface Settings {
  geminiApiKeys: string[];
  geminiApiKey: string;
  transcriptionApiKey: string;
  salesScript: string;
  schedule: ScheduleEntry[];
  driveConnected: boolean;
  driveToken: string;
  driveEmail: string;
  driveFolderId: string;
  suggestionRefreshRate: number;
  recordingSaveMode: 'local' | 'drive' | 'both';
  queueFilters: QueueFilterState;
  confirmBeforeDelete: boolean;
  activeCampaignId: string;
  serviceAccountJson: string;
  driveWebhookUrl: string;
  googleDocEmbedUrl?: string;
  emailSystemPrompt?: string;
}

export interface QueueFilterState {
  minRating: number;
  maxTier: number;
  minScore: number;
  urgency: string;
  hasWebsite: string;
  calledStatus: string;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilterState = {
  minRating: 0,
  maxTier: 3,
  minScore: 0,
  urgency: 'all',
  hasWebsite: 'all',
  calledStatus: 'all',
};

export interface ScheduleEntry {
  day: string;
  startTime: string;
  endTime: string;
}

export interface SuggestionCard {
  type: 'response' | 'objection' | 'insight';
  title: string;
  body: string;
}

export const TARGET_FIELDS = [
  'name', 'phone', 'address', 'website', 'google_maps_url',
  'rating', 'review_count', 'conversion_confidence_score',
  'outreach_tier', 'average_urgency', 'opening_hours', 'called', 'category',
  'notes', 'call_outcome', 'follow_up_date', 'call_date', 'not_interested',
  'hidden_from_queue', 'call_recording_drive_url', 'last_called_at',
  'assigned_user_id', 'assigned_user_email', 'assigned_user_name'
] as const;

export type TargetField = typeof TARGET_FIELDS[number];

export interface ColumnMapping {
  targetField: TargetField;
  csvColumn: string;
  autoDetected: boolean;
  required: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKeys: [],
  geminiApiKey: '',
  transcriptionApiKey: '',
  salesScript: '',
  schedule: [
    { day: 'Monday', startTime: '09:00', endTime: '17:00' },
    { day: 'Tuesday', startTime: '09:00', endTime: '17:00' },
    { day: 'Wednesday', startTime: '09:00', endTime: '17:00' },
    { day: 'Thursday', startTime: '09:00', endTime: '17:00' },
    { day: 'Friday', startTime: '09:00', endTime: '17:00' },
  ],
  driveConnected: false,
  driveToken: '',
  driveEmail: '',
  driveFolderId: '1XBCndWW87aMn3awjocvE8tOtdyGhjw9X',
  suggestionRefreshRate: 10,
  recordingSaveMode: 'both',
  queueFilters: DEFAULT_QUEUE_FILTERS,
  confirmBeforeDelete: false,
  activeCampaignId: '',
  serviceAccountJson: '',
  driveWebhookUrl: '',
  googleDocEmbedUrl: '',
  emailSystemPrompt: `You are writing a casual, highly personalized follow-up email after a cold call offering an AI receptionist service. The user will provide you with the Recipient Name, Company, Sender Name, Call Notes, and Inclusions.

CRITICAL RULES:
1. You MUST always write and output a complete email, even if the "Call Notes" are empty, missing, or say "No notes taken." If there are no notes, just write a polite, generalized follow-up based on the core value pitch.
2. NEVER use any dashes anywhere in the email. This includes hyphens (-), en dashes (–), and em dashes (—). Use commas, periods, or start new sentences instead of using dashes for punctuation.

EMAIL STRUCTURE TO STRICTLY FOLLOW:

1. Greeting: 
Start casually with "Hi [Recipient Name],"

2. Opening & Demo Number:
Acknowledge the call. 
ONLY IF the "Inclusions" field mentions "demo number", provide the demo phone number immediately. Use wording similar to: "Great speaking earlier. As promised, here is the demo number to give a call: 09 886 4503. Have a play and see what you think."
If "demo number" is NOT in the Inclusions field, just acknowledge the call normally (e.g., "Great speaking earlier. Here is the info we discussed.").

3. The Value Pitch & Personalization:
Use the provided "Call Notes" to write 1 to 2 short paragraphs explaining the value for their specific business. 
- Focus on practical themes: never missing a lead when flat out on a job, not having to stop work to answer the phone, handling general inquiries, or specific software integrations if mentioned.
- If the notes include a personal detail (e.g., a holiday, being busy), weave it in naturally (e.g., "Enjoy your trip!").
- Keep the tone conversational, direct, and free of corporate jargon. Make it sound like a quick note typed out by a human tradesman or founder.
- If there are no notes, default to the standard value pitch: missed calls are missed jobs, and the AI handles the general inquiries so they can stay on the tools.

4. Pricing Context (Optional based on notes):
If the notes indicate they asked about pricing, briefly mention it is a monthly retainer of around $100 to $200 depending on call volume, with no setup cost because we are currently building out case studies.

5. Call to Action (Booking Link):
ONLY IF the "Inclusions" field mentions "booking link", ask them to book a meeting and provide this exact link: https://cal.com/sparvii/15min
If "booking link" is NOT in the Inclusions field, just sign off with a soft call to action (e.g., "Let me know what you think" or "Just reply here if you're keen to chat further").

6. Sign-off:
End with:
"Cheers,
The Sender Name"

REGENERATION CONTEXT (If applicable):
If the user provides feedback to regenerate a previous draft, apply their feedback strictly.

OUTPUT FORMAT:
You MUST return your response as a valid JSON object with EXACTLY two keys: "subject" and "body".
Do not include any markdown formatting like \`\`\`json.`,
};

// Campaigns
export interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  color: string; // hex color for visual badge
  role?: 'owner' | 'member'; // Current user's role in this campaign
  ownerId?: string; // The ID of the single owner
  ownerEmail?: string;
  ownerName?: string;
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  last_active?: string;
}

export interface CampaignMember extends Profile {
  role: 'owner' | 'member';
  joined_at: string;
  total_calls: number;
  success_count?: number;
  avg_rating?: number;
  outcomes?: Record<string, number>;
}

// Named sessions
export interface Session {
  id: string;
  name: string; // e.g. "4th of July, 10:15 PM"
  startedAt: string;
  endedAt: string;
  callsMade: number;
  outcomes: Record<string, number>;
  userId?: string;
  userEmail?: string;
}

export interface SessionStats {
  sessionStart: string;
  callsMade: number;
  outcomes: Record<string, number>;
}

export function isValidWebsite(url: string): boolean {
  if (!url || !url.trim()) return false;
  const lower = url.trim().toLowerCase();
  const falsy = ['none', 'no', 'false', 'zero', 'n/a', 'na', '-', '0', 'null', 'undefined'];
  if (falsy.includes(lower)) return false;
  if (!lower.includes('http')) return false;
  try { new URL(url.trim()); return true; } catch { return false; }
}
