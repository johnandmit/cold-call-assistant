import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact } from '@/types';
import { getContacts } from '@/lib/storage';
import ContactHeroCard from '@/components/ContactHeroCard';
import { FileSpreadsheet, Phone, Globe, Search, Bell, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, su: 0,
  monday: 1, mon: 1, mo: 1,
  tuesday: 2, tue: 2, tu: 2, tues: 2,
  wednesday: 3, wed: 3, we: 3,
  thursday: 4, thu: 4, th: 4, thurs: 4,
  friday: 5, fri: 5, fr: 5,
  saturday: 6, sat: 6, sa: 6,
};

function parseTime(timeStr: string): number | null {
  const s = timeStr.trim().toLowerCase();
  if (s === 'closed') return null;
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:\u202f)?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();
  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isCurrentlyOpen(hours: string): boolean {
  if (!hours || !hours.trim()) return false;
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const entries = hours.split(/[,;|]/).map(e => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const dayTimeMatch = entry.match(/^([a-zA-Z]+(?:\s*[-–—]\s*[a-zA-Z]+)?)\s*[:]\s*(.+)$/);
    if (dayTimeMatch) {
      const dayPart = dayTimeMatch[1].trim().toLowerCase();
      const timePart = dayTimeMatch[2].trim();
      if (!isDayMatch(dayPart, currentDay)) continue;
      if (timePart.toLowerCase() === 'closed') return false;
      if (timePart.toLowerCase().includes('24 hour') || timePart.toLowerCase().includes('open 24')) return true;
      const timeRange = parseTimeRange(timePart);
      if (timeRange && currentMinutes >= timeRange.start && currentMinutes <= timeRange.end) return true;
      continue;
    }
    const noColonMatch = entry.match(/^([a-zA-Z]+(?:\s*[-–—]\s*[a-zA-Z]+)?)\s+(.+)$/);
    if (noColonMatch) {
      const dayPart = noColonMatch[1].trim().toLowerCase();
      const timePart = noColonMatch[2].trim();
      if (!isDayMatch(dayPart, currentDay)) continue;
      if (timePart.toLowerCase() === 'closed') return false;
      const timeRange = parseTimeRange(timePart);
      if (timeRange && currentMinutes >= timeRange.start && currentMinutes <= timeRange.end) return true;
    }
  }
  return false;
}

function isDayMatch(dayPart: string, currentDay: number): boolean {
  const rangeParts = dayPart.split(/\s*[-–—]\s*/);
  if (rangeParts.length === 2) {
    const startDay = DAY_NAMES[rangeParts[0].trim()];
    const endDay = DAY_NAMES[rangeParts[1].trim()];
    if (startDay !== undefined && endDay !== undefined) {
      if (startDay <= endDay) return currentDay >= startDay && currentDay <= endDay;
      return currentDay >= startDay || currentDay <= endDay;
    }
  }
  return DAY_NAMES[dayPart.trim()] === currentDay;
}

function parseTimeRange(timePart: string): { start: number; end: number } | null {
  const parts = timePart.split(/\s*[-–—to]+\s*/i);
  if (parts.length < 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[parts.length - 1]);
  if (start === null || end === null) return null;
  return { start, end };
}

function isFollowUpDue(followUpDate: string): boolean {
  if (!followUpDate) return false;
  return new Date(followUpDate) <= new Date();
}

export default function CallQueue() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const refreshContacts = useCallback(() => {
    setContacts(getContacts());
  }, []);

  useEffect(() => {
    refreshContacts();
    // Listen for storage changes (e.g. from PostCallModal marking not_interested)
    const onStorage = () => refreshContacts();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshContacts]);

  // Follow-ups due
  const followUps = useMemo(() => {
    return contacts.filter(c => c.follow_up_date && isFollowUpDue(c.follow_up_date));
  }, [contacts]);

  const sortedContacts = useMemo(() => {
    let filtered = contacts.filter(c => !c.not_interested);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(s) || c.phone.includes(s));
    }
    if (showOpenOnly) {
      filtered = filtered.filter(c => !c.opening_hours || isCurrentlyOpen(c.opening_hours));
    }

    return [...filtered].sort((a, b) => {
      // Follow-ups due first
      const aFollowUp = a.follow_up_date && isFollowUpDue(a.follow_up_date);
      const bFollowUp = b.follow_up_date && isFollowUpDue(b.follow_up_date);
      if (aFollowUp !== bFollowUp) return aFollowUp ? -1 : 1;
      // Called contacts last
      if (a.called !== b.called) return a.called ? 1 : -1;
      // Tier ascending
      if ((a.outreach_tier || 99) !== (b.outreach_tier || 99)) return (a.outreach_tier || 99) - (b.outreach_tier || 99);
      // Currently open boost
      const aOpen = isCurrentlyOpen(a.opening_hours);
      const bOpen = isCurrentlyOpen(b.opening_hours);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      // Closed businesses pushed down
      const aClosed = a.opening_hours && !aOpen;
      const bClosed = b.opening_hours && !bOpen;
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      // Conversion score descending
      return (b.conversion_confidence_score || 0) - (a.conversion_confidence_score || 0);
    });
  }, [contacts, search, showOpenOnly]);

  const heroContact = selectedId ? contacts.find(c => c.id === selectedId) || sortedContacts[0] : sortedContacts[0];

  const startCall = () => {
    if (heroContact) {
      // Check if currently open
      if (heroContact.opening_hours && !isCurrentlyOpen(heroContact.opening_hours)) {
        const proceed = window.confirm(`${heroContact.name} appears to be closed right now. Call anyway?`);
        if (!proceed) return;
      }
      navigate('/call', { state: { contact: heroContact } });
    }
  };

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">No contacts yet</h2>
        <p className="text-muted-foreground text-sm max-w-sm">Import a CSV file to populate your call queue and start making calls.</p>
        <button onClick={() => navigate('/csv')} className="text-primary font-medium text-sm hover:underline">
          Go to CSV Manager →
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Call Queue</h1>
        <div className="text-sm text-muted-foreground">{sortedContacts.filter(c => !c.called).length} remaining</div>
      </div>

      {/* Follow-up reminders */}
      {followUps.length > 0 && (
        <div className="glass-card border-warning/30 bg-warning/5 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-warning" />
            <h3 className="font-semibold text-sm text-warning">Follow-ups Due ({followUps.length})</h3>
          </div>
          <div className="space-y-1">
            {followUps.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-warning/10 transition-colors text-sm"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.follow_up_date && format(new Date(c.follow_up_date), 'MMM d, h:mm a')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {heroContact && (
        <div className="mb-6">
          <ContactHeroCard contact={heroContact} onStartCall={startCall} />
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-input border-border"
          />
        </div>
        <Button
          variant={showOpenOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOpenOnly(!showOpenOnly)}
          className="gap-1.5 shrink-0"
        >
          <Clock className="w-3.5 h-3.5" />
          {showOpenOnly ? 'Open Only' : 'All Businesses'}
        </Button>
      </div>

      <div className="space-y-1">
        {sortedContacts.map(contact => {
          const isOpen = isCurrentlyOpen(contact.opening_hours);
          const isClosed = contact.opening_hours && !isOpen;
          const isFollowUp = contact.follow_up_date && isFollowUpDue(contact.follow_up_date);

          return (
            <button
              key={contact.id}
              onClick={() => setSelectedId(contact.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                contact.id === heroContact?.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent'
              } ${contact.called && !isFollowUp ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{contact.name}</span>
                  {isFollowUp && (
                    <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                      <Bell className="w-2.5 h-2.5" /> Follow-up
                    </span>
                  )}
                  {contact.called && !isFollowUp && <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-medium">Called</span>}
                  {!contact.called && isOpen && (
                    <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-medium">Open Now</span>
                  )}
                  {!contact.called && isClosed && (
                    <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium">Closed</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{contact.phone}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {contact.website ? (
                  <Globe className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-destructive/50" />
                )}
                {contact.outreach_tier && (
                  <span className={contact.outreach_tier === 1 ? 'badge-tier1' : contact.outreach_tier === 2 ? 'badge-tier2' : 'badge-tier3'}>
                    T{contact.outreach_tier}
                  </span>
                )}
                {contact.conversion_confidence_score > 0 && (
                  <span className="text-xs text-muted-foreground">{contact.conversion_confidence_score}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
