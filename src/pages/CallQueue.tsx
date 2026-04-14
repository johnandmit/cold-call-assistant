import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Contact, isValidWebsite, QueueFilterState, DEFAULT_QUEUE_FILTERS } from '@/types';
import { getContacts, saveContacts, updateContact, getSettings, saveSettings } from '@/lib/storage';
import { isCurrentlyOpen, isFollowUpDue, getTodayHours, parseAllDayHours, getClosingMinutes } from '@/lib/hours-utils';
import { isContactSuppressed, skipContact, getSkippedIds, getActiveSession, startSession, endActiveSession } from '@/lib/session';
import ContactHeroCard from '@/components/ContactHeroCard';
import { FileSpreadsheet, Phone, Globe, Search, Bell, Clock, SlidersHorizontal, Pencil, SkipForward, EyeOff, Trash2, ChevronDown, ChevronUp, Play, Square, ExternalLink, Headphones } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

export default function CallQueue() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<QueueFilterState>(DEFAULT_QUEUE_FILTERS);
  const [expandedHoursId, setExpandedHoursId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [activeSession, setActiveSessionState] = useState(getActiveSession());
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_QUEUE_FILTERS);
  const selectedRowRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Read selectedId from navigation state (e.g. from GlobalSearch)
  React.useEffect(() => {
    const stateId = (location.state as any)?.selectedId;
    if (stateId) {
      setSelectedId(stateId);
      // Clear the state so it doesn't persist on refresh
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const handleStartSession = () => {
    const s = startSession();
    setActiveSessionState(s);
  };

  const handleEndSession = () => {
    endActiveSession();
    setActiveSessionState(null);
  };

  // Load persisted filters from settings
  useEffect(() => {
    const settings = getSettings();
    if (settings.queueFilters) {
      setFilters(settings.queueFilters);
    }
  }, []);

  // Persist filters when they change
  useEffect(() => {
    const settings = getSettings();
    settings.queueFilters = filters;
    saveSettings(settings);
  }, [filters]);

  const refreshContacts = useCallback(() => {
    setContacts(getContacts());
    setSkippedIds(getSkippedIds());
  }, []);

  // Scroll to selected contact when it changes (e.g. from search)
  React.useEffect(() => {
    if (selectedId && selectedRowRef.current) {
      setTimeout(() => {
        selectedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [selectedId, contacts]);

  useEffect(() => {
    refreshContacts();
    const onFocus = () => refreshContacts();
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onFocus);
    };
  }, [refreshContacts]);

  const followUps = useMemo(() => {
    return contacts.filter(c => c.follow_up_date && isFollowUpDue(c.follow_up_date));
  }, [contacts]);

  const sortedContacts = useMemo(() => {
    let filtered = contacts.filter(c => !c.not_interested && !c.hidden_from_queue && !isContactSuppressed(c.id) && !skippedIds.has(c.id));
    if (search) {
      const s = search.toLowerCase();
      const searchClean = s.replace(/[\s\-\(\)\.]/g, '');
      filtered = filtered.filter(c => {
        if (c.name.toLowerCase().includes(s)) return true;
        const phoneClean = c.phone.replace(/[\s\-\(\)\.]/g, '');
        if (phoneClean.includes(searchClean)) return true;
        return false;
      });
    }
    if (showOpenOnly) {
      filtered = filtered.filter(c => !c.opening_hours || isCurrentlyOpen(c.opening_hours));
    }
    if (filters.minRating > 0) filtered = filtered.filter(c => c.rating >= filters.minRating);
    if (filters.maxTier < 3) filtered = filtered.filter(c => (c.outreach_tier || 3) <= filters.maxTier);
    if (filters.minScore > 0) filtered = filtered.filter(c => c.conversion_confidence_score >= filters.minScore);
    if (filters.urgency !== 'all') filtered = filtered.filter(c => c.average_urgency === filters.urgency);
    if (filters.hasWebsite === 'yes') filtered = filtered.filter(c => isValidWebsite(c.website));
    if (filters.hasWebsite === 'no') filtered = filtered.filter(c => !isValidWebsite(c.website));
    if (filters.calledStatus === 'yes') filtered = filtered.filter(c => c.called);
    if (filters.calledStatus === 'no') filtered = filtered.filter(c => !c.called);

    return [...filtered].sort((a, b) => {
      // Follow-ups first
      const aFollowUp = a.follow_up_date && isFollowUpDue(a.follow_up_date);
      const bFollowUp = b.follow_up_date && isFollowUpDue(b.follow_up_date);
      if (aFollowUp !== bFollowUp) return aFollowUp ? -1 : 1;
      // Uncalled before called
      if (a.called !== b.called) return a.called ? 1 : -1;
      // Tier ordering
      if ((a.outreach_tier || 99) !== (b.outreach_tier || 99)) return (a.outreach_tier || 99) - (b.outreach_tier || 99);
      // Open businesses before closed
      const aOpen = isCurrentlyOpen(a.opening_hours);
      const bOpen = isCurrentlyOpen(b.opening_hours);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      // Among open businesses, prioritize those closing soon
      if (aOpen && bOpen) {
        const aClosing = getClosingMinutes(a.opening_hours);
        const bClosing = getClosingMinutes(b.opening_hours);
        if (aClosing !== null && bClosing !== null && aClosing !== bClosing) {
          return aClosing - bClosing; // closing sooner = higher priority
        }
      }
      // Closed at bottom
      const aClosed = a.opening_hours && !aOpen;
      const bClosed = b.opening_hours && !bOpen;
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return (b.conversion_confidence_score || 0) - (a.conversion_confidence_score || 0);
    });
  }, [contacts, search, showOpenOnly, filters, skippedIds]);

  const heroContact = selectedId ? contacts.find(c => c.id === selectedId) || sortedContacts[0] : sortedContacts[0];

  const startCall = () => {
    if (heroContact) {
      if (heroContact.opening_hours && !isCurrentlyOpen(heroContact.opening_hours)) {
        const proceed = window.confirm(`${heroContact.name} appears to be closed right now. Call anyway?`);
        if (!proceed) return;
      }
      // Lock queue: pass sorted IDs and current index
      const queueIds = sortedContacts.map(c => c.id);
      const queueIndex = queueIds.indexOf(heroContact.id);
      navigate('/call', { state: { contact: heroContact, queueIds, queueIndex } });
    }
  };

  const handleSkip = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    skipContact(id);
    setSkippedIds(prev => new Set([...prev, id]));
    toast.success('Skipped for the day');
  };

  const handleSuppressForever = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    updateContact(id, { hidden_from_queue: true });
    refreshContacts();
    toast.success('Hidden from queue forever');
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const settings = getSettings();
    if (settings.confirmBeforeDelete && !window.confirm('Delete this lead permanently?')) return;
    const updated = contacts.filter(c => c.id !== id);
    saveContacts(updated);
    setContacts(updated);
    toast.success('Lead deleted');
  };

  const handleInlineEdit = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    setEditingContact({ ...contact });
  };

  const saveInlineEdit = () => {
    if (!editingContact) return;
    updateContact(editingContact.id, editingContact);
    refreshContacts();
    setEditingContact(null);
    toast.success('Contact updated');
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
        <div className="flex items-center gap-3">
          {activeSession ? (
            <>
              <span className="text-xs text-muted-foreground">Session: {activeSession.name}</span>
              <Button variant="outline" size="sm" onClick={handleEndSession} className="text-xs gap-1">
                <Square className="w-3 h-3" /> End
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={handleStartSession} className="text-xs gap-1">
              <Play className="w-3 h-3" /> Start Session
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="text-xs gap-1">
            📊 Stats
          </Button>
          <div className="text-sm text-muted-foreground">{sortedContacts.filter(c => !c.called).length} remaining</div>
        </div>
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
            placeholder="Search by name or phone..."
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
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5 shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters{hasActiveFilters ? ' •' : ''}
        </Button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="glass-card p-4 mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Rating</label>
            <Input type="number" min={0} max={5} step={0.5} value={filters.minRating} onChange={e => setFilters(f => ({ ...f, minRating: Number(e.target.value) }))} className="bg-input border-border text-sm h-8" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Tier</label>
            <select value={filters.maxTier} onChange={e => setFilters(f => ({ ...f, maxTier: Number(e.target.value) }))} className="w-full h-8 rounded-md border border-border bg-input px-2 text-sm">
              <option value={1}>Tier 1 only</option>
              <option value={2}>Tier 1-2</option>
              <option value={3}>All tiers</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Score</label>
            <Input type="number" min={0} max={100} value={filters.minScore} onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) }))} className="bg-input border-border text-sm h-8" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Urgency</label>
            <select value={filters.urgency} onChange={e => setFilters(f => ({ ...f, urgency: e.target.value }))} className="w-full h-8 rounded-md border border-border bg-input px-2 text-sm">
              <option value="all">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Website</label>
            <select value={filters.hasWebsite} onChange={e => setFilters(f => ({ ...f, hasWebsite: e.target.value }))} className="w-full h-8 rounded-md border border-border bg-input px-2 text-sm">
              <option value="all">All</option>
              <option value="yes">Has website</option>
              <option value="no">No website</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Called</label>
            <select value={filters.calledStatus} onChange={e => setFilters(f => ({ ...f, calledStatus: e.target.value }))} className="w-full h-8 rounded-md border border-border bg-input px-2 text-sm">
              <option value="all">All</option>
              <option value="yes">Called</option>
              <option value="no">Not called</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_QUEUE_FILTERS)} className="text-xs">Reset</Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {sortedContacts.slice(0, visibleCount).map(contact => {
          const isOpen = isCurrentlyOpen(contact.opening_hours);
          const isClosed = contact.opening_hours && !isOpen;
          const isFollowUp = contact.follow_up_date && isFollowUpDue(contact.follow_up_date);
          const hasHours = !!contact.opening_hours;
          const isHoursExpanded = expandedHoursId === contact.id;

          return (
            <div key={contact.id}>
              <div
                ref={contact.id === selectedId ? selectedRowRef : undefined}
                onClick={() => setSelectedId(contact.id)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-all duration-200 cursor-pointer ${
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
                    {contact.call_outcome === 'no_answer' && <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium">No Answer</span>}
                    {contact.call_outcome === 'phone_not_working' && <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium">Bad #</span>}
                    {!contact.called && isOpen && (
                      <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-medium">Open Now</span>
                    )}
                    {!contact.called && isClosed && (
                      <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium">Closed</span>
                    )}
                    {contact.category && (
                      <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded">{contact.category}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono">{contact.phone}</span>
                    {hasHours && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedHoursId(isHoursExpanded ? null : contact.id); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                        <span>{getTodayHours(contact.opening_hours)}</span>
                        {isHoursExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={(e) => handleInlineEdit(e, contact)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => handleSkip(e, contact.id)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Skip for the day">
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => handleSuppressForever(e, contact.id)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Suppress forever">
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => handleDelete(e, contact.id)} className="p-1.5 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {isValidWebsite(contact.website) ? (
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
              </div>
              {/* Expanded hours */}
              {isHoursExpanded && hasHours && (
                <div className="ml-8 mb-2 glass-card p-3 text-xs space-y-1">
                  {parseAllDayHours(contact.opening_hours).map(dh => (
                    <div key={dh.day} className={`flex justify-between ${dh.isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      <span>{dh.day}</span>
                      <span>{dh.hours}</span>
                    </div>
                  ))}
                  {parseAllDayHours(contact.opening_hours).length === 0 && (
                    <span className="text-muted-foreground">{contact.opening_hours}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {visibleCount < sortedContacts.length && (
        <div className="flex justify-center pt-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            className="text-xs"
          >
            Load More ({sortedContacts.length - visibleCount} remaining)
          </Button>
        </div>
      )}

      {/* Inline Edit Modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-3">
            <h3 className="text-lg font-bold mb-4">Edit Contact</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editingContact.name} onChange={e => setEditingContact({ ...editingContact, name: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={editingContact.phone} onChange={e => setEditingContact({ ...editingContact, phone: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Website</label>
              <Input value={editingContact.website} onChange={e => setEditingContact({ ...editingContact, website: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={editingContact.address} onChange={e => setEditingContact({ ...editingContact, address: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input value={editingContact.notes} onChange={e => setEditingContact({ ...editingContact, notes: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">Audio Recording URL <Headphones className="w-3 h-3" /></label>
              <div className="flex gap-2">
                <Input value={editingContact.call_recording_drive_url || ''} onChange={e => setEditingContact({ ...editingContact, call_recording_drive_url: e.target.value })} placeholder="https://drive.google.com/..." className="bg-input border-border flex-1" />
                {editingContact.call_recording_drive_url && (
                  <a href={editingContact.call_recording_drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-accent transition-colors text-primary shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={saveInlineEdit} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => setEditingContact(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
