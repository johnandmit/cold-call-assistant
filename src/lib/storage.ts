import { Contact, Call, Settings, DEFAULT_SETTINGS } from '@/types';

const CONTACTS_KEY = 'sales-assistant-contacts';
const CALLS_KEY = 'sales-assistant-calls';
const SETTINGS_KEY = 'sales-assistant-settings';

export function getContacts(): Contact[] {
  try {
    const data = localStorage.getItem(CONTACTS_KEY);
    const contacts = data ? JSON.parse(data) : [];
    // Migrate: add category field if missing
    return contacts.map((c: any) => ({ ...c, category: c.category || '' }));
  } catch { return []; }
}

export function saveContacts(contacts: Contact[]) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function updateContact(id: string, updates: Partial<Contact>) {
  const contacts = getContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx !== -1) {
    contacts[idx] = { ...contacts[idx], ...updates };
    saveContacts(contacts);
  }
  return contacts;
}

export function getCalls(): Call[] {
  try {
    const data = localStorage.getItem(CALLS_KEY);
    const calls = data ? JSON.parse(data) : [];
    return calls.map((c: any) => ({ ...c, call_rating: c.call_rating || 0, session_id: c.session_id || '', category: c.category || '' }));
  } catch { return []; }
}

export function saveCalls(calls: Call[]) {
  localStorage.setItem(CALLS_KEY, JSON.stringify(calls));
}

export function addCall(call: Call) {
  const calls = getCalls();
  calls.push(call);
  saveCalls(calls);
}

export function getSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
