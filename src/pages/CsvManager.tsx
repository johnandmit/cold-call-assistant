import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { Contact, ColumnMapping, isValidWebsite } from '@/types';
import { getContacts, saveContacts, getSettings, getCampaigns, getActiveCampaignId, ensureCampaigns } from '@/lib/storage';
import { autoDetectMappings, mapRowToContact, parseCalled } from '@/lib/csv-utils';
import { checkCrossCampaignDuplicates, CrossCampaignMatch } from '@/lib/cross-campaign-check';
import { getTodayHours } from '@/lib/hours-utils';
import { v4 } from '@/lib/uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileSpreadsheet, Download, Search, X, Check, AlertTriangle, Edit3, Trash2, Clock, Shield, ChevronDown, ChevronUp, Copy, ExternalLink, CornerUpRight } from 'lucide-react';
import { Campaign } from '@/types';
import { toast } from 'sonner';

const CSV_PAGE_SIZE = 50;

type FilterState = {
  minRating: number;
  maxTier: number;
  minScore: number;
  urgency: string;
  hasWebsite: string;
  calledStatus: string;
  noteType: string;
};

const DEFAULT_FILTERS: FilterState = {
  minRating: 0,
  maxTier: 3,
  minScore: 0,
  urgency: 'all',
  hasWebsite: 'all',
  calledStatus: 'all',
  noteType: 'all',
};

export default function CsvManager() {
  const [contacts, setContacts] = useState<Contact[]>(getContacts());
  const [search, setSearch] = useState('');
  const [showMapper, setShowMapper] = useState(false);
  const [csvData, setCsvData] = useState<Record<string, any>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [conflicts, setConflicts] = useState<Contact[][]>([]);
  const [resolvedContacts, setResolvedContacts] = useState<Contact[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCrossCheck, setShowCrossCheck] = useState(false);
  const [crossCheckCampaigns, setCrossCheckCampaigns] = useState<Set<string>>(new Set());
  const [crossCheckResults, setCrossCheckResults] = useState<CrossCampaignMatch[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignIdState] = useState('');
  const [csvVisibleCount, setCsvVisibleCount] = useState(CSV_PAGE_SIZE);

  // Delete key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedIds.size > 0) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

  // Load campaigns on mount
  useEffect(() => {
    ensureCampaigns();
    setAllCampaigns(getCampaigns());
    setActiveCampaignIdState(getActiveCampaignId());
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.data.length === 0) {
            toast.error('CSV file is empty');
            return;
          }
          const cols = results.meta.fields || [];
          setCsvData(results.data as Record<string, any>[]);
          setCsvColumns(cols);
          setMappings(autoDetectMappings(cols));
          setShowMapper(true);
        },
        error: () => toast.error('Failed to parse CSV'),
      });
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const updateMapping = (targetField: string, csvColumn: string) => {
    setMappings(prev => prev.map(m => m.targetField === targetField ? { ...m, csvColumn, autoDetected: false } : m));
  };

  const confirmMapping = () => {
    const nameMapped = mappings.find(m => m.targetField === 'name')?.csvColumn;
    const phoneMapped = mappings.find(m => m.targetField === 'phone')?.csvColumn;
    if (!nameMapped || !phoneMapped) {
      toast.error('Name and Phone fields are required');
      return;
    }

    const existing = getContacts();
    const newContacts: Contact[] = csvData.map(row => {
      const mapped = mapRowToContact(row, mappings);
      const calledMapping = mappings.find(m => m.targetField === 'called');
      const calledRaw = calledMapping?.csvColumn ? row[calledMapping.csvColumn] : undefined;
      const notInterestedMapping = mappings.find(m => m.targetField === 'not_interested');
      const notInterestedRaw = notInterestedMapping?.csvColumn ? row[notInterestedMapping.csvColumn] : undefined;
      return {
        id: v4(),
        name: String(mapped.name || ''),
        phone: String(mapped.phone || ''),
        address: String(mapped.address || ''),
        website: String(mapped.website || ''),
        google_maps_url: String(mapped.google_maps_url || ''),
        rating: Number(mapped.rating) || 0,
        review_count: Number(mapped.review_count) || 0,
        conversion_confidence_score: Number(mapped.conversion_confidence_score) || 0,
        outreach_tier: Number(mapped.outreach_tier) || 3,
        average_urgency: (['High', 'Medium', 'Low'].includes(String(mapped.average_urgency)) ? String(mapped.average_urgency) : '') as any,
        opening_hours: String(mapped.opening_hours || ''),
        notes: String(mapped.notes || ''),
        called: parseCalled(calledRaw),
        call_date: String(mapped.call_date || ''),
        call_recording_drive_url: '',
        not_interested: parseCalled(notInterestedRaw),
        follow_up_date: String(mapped.follow_up_date || ''),
        call_outcome: String(mapped.call_outcome || ''),
        suppressed_until: '',
        category: String(mapped.category || ''),
        hidden_from_queue: (() => {
          const hiddenMapping = mappings.find(m => m.targetField === 'hidden_from_queue');
          const hiddenRaw = hiddenMapping?.csvColumn ? row[hiddenMapping.csvColumn] : undefined;
          return parseCalled(hiddenRaw);
        })(),
      };
    }).filter(c => c.name && c.phone);

    const hasMeaningfulData = (c: Contact) => {
      return (c.notes?.trim().length > 0) || 
             c.called || 
             (c.call_outcome?.trim().length > 0) || 
             c.not_interested || 
             (c.follow_up_date?.trim().length > 0);
    };

    const isIdentical = (a: Contact, b: Contact) => {
      const keys = Object.keys(a) as (keyof Contact)[];
      for (const k of keys) {
        if (k === 'id') continue;
        if (a[k] !== b[k]) return false;
      }
      return true;
    };

    const normalizePhone = (p: string) => p.replace(/\D/g, '');

    const phoneGroups = new Map<string, Contact[]>();
    for (const c of [...existing, ...newContacts]) {
      const p = normalizePhone(c.phone);
      if (!p) continue;
      if (!phoneGroups.has(p)) phoneGroups.set(p, []);
      phoneGroups.get(p)!.push(c);
    }

    const autoResolved: Contact[] = [];
    const pendingConflicts: Contact[][] = [];
    let dupeCount = 0;

    for (const group of phoneGroups.values()) {
      if (group.length === 1) {
        autoResolved.push(group[0]);
        continue;
      }
      
      dupeCount += group.length - 1;

      // Group has multiple contacts. Let's find unique variants based on meaningful data
      const dataContacts = group.filter(hasMeaningfulData);

      if (dataContacts.length === 0) {
        // No variant has notes/data, just keep the first one (prefer existing if it was first)
        autoResolved.push(group[0]);
      } else if (dataContacts.length === 1) {
        // Only one variant has notes/data, keep it!
        autoResolved.push(dataContacts[0]);
      } else {
        // Multiple variants have meaningful data. Deduplicate exact identical variants.
        const uniqueVariants: Contact[] = [];
        for (const dc of dataContacts) {
          if (!uniqueVariants.some(v => isIdentical(v, dc))) {
            uniqueVariants.push(dc);
          }
        }

        if (uniqueVariants.length === 1) {
          autoResolved.push(uniqueVariants[0]);
        } else {
          pendingConflicts.push(uniqueVariants);
        }
      }
    }

    if (pendingConflicts.length > 0) {
      setConflicts(pendingConflicts);
      setResolvedContacts(autoResolved);
      setShowMapper(false);
      return;
    }

    saveContacts(autoResolved);
    setContacts(autoResolved);
    setShowMapper(false);
    setCsvData([]);

    toast.success(`Imported/Merged successfully${dupeCount > 0 ? ` (${dupeCount} duplicates auto-resolved)` : ''}`);
  };

  const submitResolutions = (finalResolved: Contact[]) => {
    const fullyMerged = [...resolvedContacts, ...finalResolved];
    saveContacts(fullyMerged);
    setContacts(fullyMerged);
    setConflicts([]);
    setResolvedContacts([]);
    setCsvData([]);
    toast.success(`Imported/Merged successfully (${finalResolved.length} conflicts resolved manually)`);
  };

  const exportCsv = () => {
    // Export all contact fields for full session portability
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
    }));
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const saveNote = (id: string) => {
    const updated = contacts.map(c => c.id === id ? { ...c, notes: noteText } : c);
    saveContacts(updated);
    setContacts(updated);
    setEditingNote(null);
    toast.success('Note saved');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  // Drag-to-select/deselect
  const handleRowMouseDown = (idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
    e.preventDefault();
    const id = filtered[idx]?.id;
    if (!id) return;

    // Shift+click for range selection
    if (e.shiftKey && lastClickedIdx !== null) {
      const start = Math.min(lastClickedIdx, idx);
      const end = Math.max(lastClickedIdx, idx);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const rid = filtered[i]?.id;
          if (rid) next.add(rid);
        }
        return next;
      });
      return;
    }

    setLastClickedIdx(idx);
    const wasSelected = selectedIds.has(id);
    const mode = wasSelected ? 'deselect' : 'select';
    setIsDragging(true);
    setDragStartIdx(idx);
    setDragMode(mode);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (mode === 'select') next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleRowMouseEnter = (idx: number) => {
    if (!isDragging || dragStartIdx === null) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const id = filtered[idx]?.id;
      if (id) {
        if (dragMode === 'select') next.add(id); else next.delete(id);
      }
      return next;
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStartIdx(null);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    const updated = contacts.filter(c => !selectedIds.has(c.id));
    saveContacts(updated);
    setContacts(updated);
    setSelectedIds(new Set());
    toast.success(`Deleted ${selectedIds.size} contacts`);
  };

  const markSelectedCalled = (called: boolean) => {
    const updated = contacts.map(c => selectedIds.has(c.id) ? { ...c, called } : c);
    saveContacts(updated);
    setContacts(updated);
    setSelectedIds(new Set());
    toast.success(`Updated ${selectedIds.size} contacts`);
  };

  const deleteContact = (id: string) => {
    const settings = getSettings();
    if (settings.confirmBeforeDelete && !window.confirm('Delete this contact?')) return;
    const updated = contacts.filter(c => c.id !== id);
    saveContacts(updated);
    setContacts(updated);
    toast.success('Contact deleted');
  };

  const handleDeleteFromOther = (match: CrossCampaignMatch) => {
    const otherContacts = getContacts(match.matchedCampaignId);
    const updated = otherContacts.filter(c => c.id !== match.matchedContact.id);
    saveContacts(updated, match.matchedCampaignId);
    setCrossCheckResults(prev => prev.filter(m => m.matchedContact.id !== match.matchedContact.id));
    toast.success(`Deleted from ${match.matchedCampaignName}`);
  };

  const handleMergeNotes = (match: CrossCampaignMatch) => {
    const currentContact = contacts.find(c => c.id === match.contact.id);
    if (!currentContact) return;

    const newNotes = [
      currentContact.notes,
      match.matchedContact.notes ? `\n--- Merged from ${match.matchedCampaignName} ---\n${match.matchedContact.notes}` : ''
    ].filter(Boolean).join('\n').trim();

    const updatedContact = {
      ...currentContact,
      notes: newNotes,
      // Copy other fields if current is empty
      address: currentContact.address || match.matchedContact.address,
      website: currentContact.website || match.matchedContact.website,
      category: currentContact.category || match.matchedContact.category,
    };

    const updatedContacts = contacts.map(c => c.id === updatedContact.id ? updatedContact : c);
    saveContacts(updatedContacts);
    setContacts(updatedContacts);
    
    // Remove from matches after merging
    setCrossCheckResults(prev => prev.filter(m => m.matchedContact.id !== match.matchedContact.id));
    toast.success(`Merged notes from ${match.matchedCampaignName}`);
  };

  const handleMoveContact = (match: CrossCampaignMatch) => {
    handleMergeNotes(match);
    handleDeleteFromOther(match);
    toast.success(`Moved lead from ${match.matchedCampaignName} to here`);
  };

  const saveEditedContact = () => {
    if (!editingContact) return;
    const updated = contacts.map(c => c.id === editingContact.id ? editingContact : c);
    saveContacts(updated);
    setContacts(updated);
    setEditingContact(null);
    toast.success('Contact updated');
  };

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(s) || c.phone.includes(s));
    }
    if (filters.minRating > 0) list = list.filter(c => c.rating >= filters.minRating);
    if (filters.maxTier < 3) list = list.filter(c => (c.outreach_tier || 3) <= filters.maxTier);
    if (filters.minScore > 0) list = list.filter(c => c.conversion_confidence_score >= filters.minScore);
    if (filters.urgency !== 'all') list = list.filter(c => c.average_urgency === filters.urgency);
    if (filters.hasWebsite === 'yes') list = list.filter(c => isValidWebsite(c.website));
    if (filters.hasWebsite === 'no') list = list.filter(c => !isValidWebsite(c.website));
    if (filters.calledStatus === 'yes') list = list.filter(c => c.called);
    if (filters.calledStatus === 'no') list = list.filter(c => !c.called);
    if (filters.noteType === 'follow_up') list = list.filter(c => c.follow_up_date);
    if (filters.noteType === 'not_interested') list = list.filter(c => c.not_interested);
    if (filters.noteType === 'warm_lead') list = list.filter(c => c.notes && c.notes.trim().length > 0 && !c.not_interested);
    if (filters.noteType === 'has_outcome') list = list.filter(c => c.call_outcome && c.call_outcome.trim().length > 0);
    if (filters.noteType === 'no_notes') list = list.filter(c => !c.notes || c.notes.trim().length === 0);
    return list;
  }, [contacts, search, filters]);

  const unmappedCount = mappings.filter(m => !m.csvColumn).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">CSV Manager</h1>
        <div className="flex gap-2">
          {contacts.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="glass-card border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 text-center cursor-pointer mb-6"
      >
        <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium text-sm">Drop CSV files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Supports multiple .csv files</p>
        <input ref={fileRef} type="file" accept=".csv" multiple onChange={e => handleFiles(e.target.files)} className="hidden" />
      </div>

      {/* Cross-Campaign Duplicate Checker */}
      {allCampaigns.length > 1 && (
        <div className="glass-card mb-6 overflow-hidden">
          <button
            onClick={() => setShowCrossCheck(!showCrossCheck)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Cross-Campaign Lead Checker</span>
              <span className="text-xs text-muted-foreground">Check for duplicate leads across campaigns</span>
            </div>
            {showCrossCheck ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showCrossCheck && (
            <div className="border-t border-border p-4 space-y-4 animate-fade-in">
              <p className="text-xs text-muted-foreground">Select which campaigns to check against for duplicate leads:</p>
              <div className="flex flex-wrap gap-2">
                {allCampaigns.filter(c => c.id !== activeCampaignId).map(campaign => (
                  <label key={campaign.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={crossCheckCampaigns.has(campaign.id)}
                      onChange={(e) => {
                        setCrossCheckCampaigns(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(campaign.id);
                          else next.delete(campaign.id);
                          return next;
                        });
                      }}
                      className="accent-primary"
                    />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: campaign.color }} />
                    {campaign.name}
                  </label>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={crossCheckCampaigns.size === 0}
                onClick={() => {
                  const results = checkCrossCampaignDuplicates(activeCampaignId, [...crossCheckCampaigns]);
                  setCrossCheckResults(results);
                  if (results.length === 0) {
                    toast.success('No duplicates found across selected campaigns!');
                  }
                }}
                className="gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" />
                Run Check ({crossCheckCampaigns.size} campaign{crossCheckCampaigns.size !== 1 ? 's' : ''})
              </Button>

              {/* Results */}
              {crossCheckResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {crossCheckResults.length} duplicate{crossCheckResults.length !== 1 ? 's' : ''} found
                  </p>
                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {crossCheckResults.map((match, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-warning/5 border border-warning/20 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-xs md:text-sm">{match.contact.name}</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground ml-2 font-mono">{match.contact.phone}</span>
                        </div>
                        <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: allCampaigns.find(c => c.id === match.matchedCampaignId)?.color }} />
                          <span className="truncate max-w-[80px]">{match.matchedCampaignName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-primary hover:text-primary hover:bg-primary/10"
                            title="Merge Notes to Current"
                            onClick={() => handleMergeNotes(match)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-success hover:text-success hover:bg-success/10"
                            title="Move here (Merge & Delete from other)"
                            onClick={() => handleMoveContact(match)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete from Other Campaign"
                            onClick={() => handleDeleteFromOther(match)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Column Mapping Modal */}
      {showMapper && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 animate-fade-in-scale">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Column Mapping</h2>
              <button onClick={() => setShowMapper(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{csvData.length} rows found. Map CSV columns to contact fields.</p>
            {unmappedCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-warning mb-4">
                <AlertTriangle className="w-4 h-4" />
                {unmappedCount} field{unmappedCount > 1 ? 's' : ''} unmapped — review below
              </div>
            )}
            <div className="space-y-2 mb-6">
              {mappings.map(m => (
                <div key={m.targetField} className={`flex items-center gap-3 ${!m.csvColumn ? 'bg-warning/5 rounded-lg p-1 -m-1' : ''}`}>
                  <div className="w-44 text-sm font-medium flex items-center gap-1.5">
                    {!m.csvColumn && !m.required && <span className="w-2 h-2 rounded-full bg-warning/60 shrink-0" />}
                    {!m.csvColumn && m.required && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                    {m.csvColumn && m.autoDetected && <Check className="w-3 h-3 text-success shrink-0" />}
                    {m.csvColumn && !m.autoDetected && <Check className="w-3 h-3 text-primary shrink-0" />}
                    {m.targetField}
                    {m.required && <span className="text-destructive text-xs">*</span>}
                  </div>
                  <select
                    value={m.csvColumn}
                    onChange={e => updateMapping(m.targetField, e.target.value)}
                    className={`flex-1 h-9 rounded-md border px-3 text-sm ${!m.csvColumn ? 'border-warning/40 bg-warning/5 text-warning' : 'border-border bg-input'}`}
                  >
                    <option value="">{!m.csvColumn ? '⚠ Not mapped — select column' : '— Unmapped —'}</option>
                    {csvColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {(!mappings.find(m => m.targetField === 'name')?.csvColumn || !mappings.find(m => m.targetField === 'phone')?.csvColumn) && (
              <div className="flex items-center gap-2 text-sm text-warning mb-4">
                <AlertTriangle className="w-4 h-4" />
                Name and Phone are required fields
              </div>
            )}
            <Button onClick={confirmMapping} className="w-full">Confirm Mapping & Import</Button>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 animate-fade-in-scale">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Contact</h2>
              <button onClick={() => setEditingContact(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {([
                ['name', 'Name'],
                ['phone', 'Phone'],
                ['address', 'Address'],
                ['website', 'Website'],
                ['google_maps_url', 'Google Maps URL'],
                ['opening_hours', 'Opening Hours'],
                ['category', 'Category / Niche'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                  <Input
                    value={String((editingContact as any)[key] || '')}
                    onChange={e => setEditingContact({ ...editingContact, [key]: e.target.value })}
                    className="bg-input border-border text-sm"
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Rating</label>
                  <Input type="number" min={0} max={5} step={0.1} value={editingContact.rating} onChange={e => setEditingContact({ ...editingContact, rating: Number(e.target.value) })} className="bg-input border-border text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tier</label>
                  <Input type="number" min={1} max={3} value={editingContact.outreach_tier} onChange={e => setEditingContact({ ...editingContact, outreach_tier: Number(e.target.value) })} className="bg-input border-border text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Score</label>
                  <Input type="number" min={0} max={100} value={editingContact.conversion_confidence_score} onChange={e => setEditingContact({ ...editingContact, conversion_confidence_score: Number(e.target.value) })} className="bg-input border-border text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Urgency</label>
                <select
                  value={editingContact.average_urgency}
                  onChange={e => setEditingContact({ ...editingContact, average_urgency: e.target.value as any })}
                  className="w-full h-9 rounded-md border border-border bg-input px-3 text-sm"
                >
                  <option value="">None</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingContact.called} onChange={e => setEditingContact({ ...editingContact, called: e.target.checked })} className="accent-primary" />
                  Called
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingContact.not_interested} onChange={e => setEditingContact({ ...editingContact, not_interested: e.target.checked })} className="accent-primary" />
                  Not Interested
                </label>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Textarea value={editingContact.notes} onChange={e => setEditingContact({ ...editingContact, notes: e.target.value })} className="bg-input border-border text-sm min-h-[60px]" />
              </div>
            </div>
            <Button onClick={saveEditedContact} className="w-full mt-4">Save Changes</Button>
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {conflicts.length > 0 && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={submitResolutions}
          onCancel={() => {
            setConflicts([]);
            setResolvedContacts([]);
            setCsvData([]);
            toast.error('Import cancelled');
          }}
        />
      )}

      {/* Contacts Table */}
      {contacts.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-input border-border" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={showFilters ? 'border-primary text-primary' : ''}>
              Filters {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) ? '•' : ''}
            </Button>
          </div>

          {/* Filters */}
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
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Status</label>
                <select value={filters.noteType} onChange={e => setFilters(f => ({ ...f, noteType: e.target.value }))} className="w-full h-8 rounded-md border border-border bg-input px-2 text-sm">
                  <option value="all">All</option>
                  <option value="follow_up">Follow-up Due</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="warm_lead">Warm Leads (has notes)</option>
                  <option value="has_outcome">Has Outcome</option>
                  <option value="no_notes">No Notes</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs">Reset</Button>
              </div>
            </div>
          )}

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="glass-card p-3 mb-4 flex items-center gap-3 animate-fade-in">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={() => markSelectedCalled(true)} className="text-xs h-7">Mark Called</Button>
              <Button variant="outline" size="sm" onClick={() => markSelectedCalled(false)} className="text-xs h-7">Mark Not Called</Button>
              <Button variant="destructive" size="sm" onClick={deleteSelected} className="text-xs h-7 gap-1">
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
              <span className="text-xs text-muted-foreground ml-1">Press Delete key</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-xs h-7 ml-auto">Clear</Button>
            </div>
          )}

          <div className="glass-card overflow-hidden" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="overflow-x-auto select-none">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 w-12">
                      <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="accent-primary w-5 h-5 cursor-pointer" />
                    </th>
                    {['Name', 'Phone', 'Rating', 'Tier', 'Score', 'Urgency', 'Website', 'Hours', 'Category', 'Notes', 'Called', ''].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, csvVisibleCount).map((c, idx) => (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 transition-colors cursor-pointer ${c.called ? 'bg-success/5' : ''} ${selectedIds.has(c.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                      onMouseDown={(e) => handleRowMouseDown(idx, e)}
                      onMouseEnter={() => handleRowMouseEnter(idx)}
                    >
                      <td className="p-3">
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-primary w-5 h-5 cursor-pointer" />
                      </td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{c.phone}</td>
                      <td className="p-3">{c.rating > 0 ? `⭐ ${c.rating}` : '—'}</td>
                      <td className="p-3"><span className={c.outreach_tier === 1 ? 'badge-tier1' : c.outreach_tier === 2 ? 'badge-tier2' : 'badge-tier3'}>T{c.outreach_tier}</span></td>
                      <td className="p-3">{c.conversion_confidence_score > 0 ? `${c.conversion_confidence_score}%` : '—'}</td>
                      <td className="p-3">{c.average_urgency || '—'}</td>
                      <td className="p-3">{isValidWebsite(c.website) ? '✓' : '✗'}</td>
                      <td className="p-3 max-w-[120px]">
                        {c.opening_hours ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={c.opening_hours}>
                            <Clock className="w-3 h-3 shrink-0" />
                            {getTodayHours(c.opening_hours)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{c.category || '—'}</td>
                      <td className="p-3">
                        {editingNote === c.id ? (
                          <div className="flex gap-1">
                            <input value={noteText} onChange={e => setNoteText(e.target.value)} className="flex-1 h-7 text-xs rounded border border-border bg-input px-2" />
                            <button onClick={() => saveNote(c.id)} className="text-success"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingNote(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingNote(c.id); setNoteText(c.notes); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                            {c.notes ? c.notes.slice(0, 30) + (c.notes.length > 30 ? '...' : '') : <Edit3 className="w-3 h-3" />}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        {c.called ? <Check className="w-4 h-4 text-success" /> : '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingContact({ ...c })} className="text-muted-foreground hover:text-foreground p-1">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteContact(c.id)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
              <span>Showing {Math.min(csvVisibleCount, filtered.length)} of {filtered.length} contacts ({contacts.length} total)</span>
              {csvVisibleCount < filtered.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCsvVisibleCount(prev => prev + CSV_PAGE_SIZE)}
                  className="text-xs h-6"
                >
                  Load More ({filtered.length - csvVisibleCount} remaining)
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {contacts.length === 0 && (
        <div className="text-center py-12">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No contacts yet — import a CSV to get started</p>
        </div>
      )}
    </div>
  );
}

function ConflictResolver({ conflicts, onResolve, onCancel }: { conflicts: Contact[][], onResolve: (resolved: Contact[]) => void, onCancel: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolvedChoices, setResolvedChoices] = useState<Contact[]>([]);

  const group = conflicts[currentIndex];

  const handleKeep = (c: Contact) => {
    const nextChoices = [...resolvedChoices, c];
    if (currentIndex + 1 < conflicts.length) {
      setResolvedChoices(nextChoices);
      setCurrentIndex(currentIndex + 1);
    } else {
      onResolve(nextChoices);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-scale">
        <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-warning flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Duplicate Conflict Resolution
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Conflict {currentIndex + 1} of {conflicts.length}: Multiple variants of this contact have notes or data. Keep one.
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-2"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.map((c, i) => (
              <div key={i} className="glass-card p-4 flex flex-col">
                <div className="flex-1 space-y-3 mb-4">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs font-mono text-muted-foreground">{c.phone}</div>
                  </div>
                  
                  {c.category && (
                    <div className="text-xs">
                      <span className="font-medium text-muted-foreground">Category:</span> {c.category}
                    </div>
                  )}

                  <div className="text-xs bg-background/50 rounded-md p-3 border border-border">
                    <span className="font-medium text-muted-foreground block mb-1">Notes:</span> 
                    <div className="whitespace-pre-wrap">{c.notes || <span className="text-muted-foreground italic">None</span>}</div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {c.called && <span className="bg-success/20 text-success px-2 py-1 rounded">Called</span>}
                    {c.not_interested && <span className="bg-destructive/20 text-destructive px-2 py-1 rounded">Not Interested</span>}
                    {c.call_outcome && <span className="bg-accent text-accent-foreground px-2 py-1 rounded">Outcome: {c.call_outcome}</span>}
                    {c.follow_up_date && <span className="bg-warning/20 text-warning px-2 py-1 rounded">Follow up: {c.follow_up_date}</span>}
                  </div>
                </div>
                
                <Button onClick={() => handleKeep(c)} className="w-full">Keep This Version</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
