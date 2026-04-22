import Papa from 'papaparse';
import { getContacts } from '@/lib/storage';

export function downloadCsv() {
  const contacts = getContacts();
  if (contacts.length === 0) return;

  const exportData = contacts.map(c => ({
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
    category: c.category,
    notes: c.notes,
    called: c.called ? 'yes' : 'no',
    call_date: c.call_date,
    call_outcome: c.call_outcome,
    follow_up_date: c.follow_up_date,
    not_interested: c.not_interested ? 'yes' : 'no',
    hidden_from_queue: c.hidden_from_queue ? 'yes' : 'no',
    call_recording_drive_url: c.call_recording_drive_url || '',
    last_called_at: c.last_called_at || '',
    assigned_user_email: c.assigned_user_email || '',
    assigned_user_name: c.assigned_user_name || '',
  }));

  const csv = Papa.unparse(exportData);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
