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
  geminiApiKey: string;
  salesScript: string;
  schedule: ScheduleEntry[];
  driveConnected: boolean;
  driveToken: string;
  driveEmail: string;
  suggestionRefreshRate: number;
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
  'outreach_tier', 'average_urgency', 'opening_hours',
] as const;

export type TargetField = typeof TARGET_FIELDS[number];

export interface ColumnMapping {
  targetField: TargetField;
  csvColumn: string;
  autoDetected: boolean;
  required: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
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
};
