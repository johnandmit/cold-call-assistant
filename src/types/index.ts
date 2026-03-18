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
  'hidden_from_queue',
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
  driveFolderId: '',
  suggestionRefreshRate: 10,
  recordingSaveMode: 'local',
  queueFilters: DEFAULT_QUEUE_FILTERS,
  confirmBeforeDelete: false,
};

// Named sessions
export interface Session {
  id: string;
  name: string; // e.g. "4th of July, 10:15 PM"
  startedAt: string;
  endedAt: string;
  callsMade: number;
  outcomes: Record<string, number>;
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
