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
  call_outcome: string; // 'no_answer' | 'phone_not_working' | 'interested' | 'not_interested' | etc.
  suppressed_until: string; // ISO date – suppressed for the session/day
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
}

export interface Settings {
  geminiApiKeys: string[]; // multiple keys with auto-cycling
  geminiApiKey: string; // legacy single key, kept for compat
  salesScript: string;
  schedule: ScheduleEntry[];
  driveConnected: boolean;
  driveToken: string;
  driveEmail: string;
  suggestionRefreshRate: number;
  recordingSaveMode: 'local' | 'drive' | 'both';
}

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
  'outreach_tier', 'average_urgency', 'opening_hours', 'called',
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
  suggestionRefreshRate: 10,
  recordingSaveMode: 'local',
};

// Session stats tracking
export interface SessionStats {
  sessionStart: string;
  callsMade: number;
  outcomes: Record<string, number>; // outcome -> count
}

export function isValidWebsite(url: string): boolean {
  if (!url || !url.trim()) return false;
  const lower = url.trim().toLowerCase();
  const falsy = ['none', 'no', 'false', 'zero', 'n/a', 'na', '-', '0', 'null', 'undefined'];
  if (falsy.includes(lower)) return false;
  if (!lower.includes('http')) return false;
  try { new URL(url.trim()); return true; } catch { return false; }
}
