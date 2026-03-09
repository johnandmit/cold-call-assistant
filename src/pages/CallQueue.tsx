import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact } from '@/types';
import { getContacts } from '@/lib/storage';
import ContactHeroCard from '@/components/ContactHeroCard';
import { FileSpreadsheet, Phone, Globe, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

function isCurrentlyOpen(hours: string): boolean {
  if (!hours) return false;
  // Simple heuristic: if hours string contains current day abbreviation
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const today = days[now.getDay()];
  const h = now.getHours();
  // Very basic: if the string mentions today and it's business hours
  return hours.toLowerCase().includes(today.toLowerCase()) || (h >= 9 && h < 17);
}

export default function CallQueue() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setContacts(getContacts());
  }, []);

  const sortedContacts = useMemo(() => {
    let filtered = contacts.filter(c => !c.not_interested);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(s) || c.phone.includes(s));
    }

    return [...filtered].sort((a, b) => {
      // Called contacts last
      if (a.called !== b.called) return a.called ? 1 : -1;
      // Tier ascending
      if ((a.outreach_tier || 99) !== (b.outreach_tier || 99)) return (a.outreach_tier || 99) - (b.outreach_tier || 99);
      // Currently open boost
      const aOpen = isCurrentlyOpen(a.opening_hours);
      const bOpen = isCurrentlyOpen(b.opening_hours);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      // Conversion score descending
      return (b.conversion_confidence_score || 0) - (a.conversion_confidence_score || 0);
    });
  }, [contacts, search]);

  const heroContact = selectedId ? contacts.find(c => c.id === selectedId) || sortedContacts[0] : sortedContacts[0];

  const startCall = () => {
    if (heroContact) {
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

      {heroContact && (
        <div className="mb-6">
          <ContactHeroCard contact={heroContact} onStartCall={startCall} />
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-input border-border"
          />
        </div>
      </div>

      <div className="space-y-1">
        {sortedContacts.map(contact => (
          <button
            key={contact.id}
            onClick={() => setSelectedId(contact.id)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
              contact.id === heroContact?.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent'
            } ${contact.called ? 'opacity-50' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{contact.name}</span>
                {contact.called && <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-medium">Called</span>}
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
        ))}
      </div>
    </div>
  );
}
