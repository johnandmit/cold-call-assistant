import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { Contact, ColumnMapping, isValidWebsite } from '@/types';
import { getContacts, saveContacts, getSettings, getCampaigns, getActiveCampaignId, ensureCampaigns } from '@/lib/storage';
import { autoDetectMappings, mapRowToContact, parseCalled } from '@/lib/csv-utils';
import { checkCrossCampaignDuplicates, CrossCampaignMatch } from '@/lib/cross-campaign-check';
import { downloadCsv } from '@/lib/csv-export';
import { joinCampaign } from '@/lib/supabase-sync';
import { getTodayHours } from '@/lib/hours-utils';
import { v4 } from '@/lib/uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileSpreadsheet, Download, Search, X, Check, AlertTriangle, Edit3, Trash2, Clock, Shield, ChevronDown, ChevronUp, Copy, ExternalLink, UserMinus, Activity } from 'lucide-react';
import { Campaign, CampaignMember } from '@/types';
import { toast } from 'sonner';
import { fetchCampaignMembers, supabase } from '@/lib/supabase-sync';

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

  // Sharing & Joining Campaign
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [crossCheckResults, setCrossCheckResults] = useState<CrossCampaignMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignIdState] = useState('');
  const [csvVisibleCount, setCsvVisibleCount] = useState(CSV_PAGE_SIZE);
  const [teamMembers, setTeamMembers] = useState<CampaignMember[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showDistributor, setShowDistributor] = useState(false);

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
    const campId = getActiveCampaignId();
    setActiveCampaignIdState(campId);

    if (campId) {
      fetchCampaignMembers(campId).then(setTeamMembers);
    }
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    const toastId = toast.loading('Processing CSV file(s)...');
    
    fileArray.forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (fileRef.current) fileRef.current.value = ''; // Reset after parse
          toast.dismiss(toastId);
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
        error: () => {
          if (fileRef.current) fileRef.current.value = ''; // Reset on error
          toast.dismiss(toastId);
          toast.error('Failed to parse CSV');
        },
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
    try {
      const nameMapped = mappings.find(m => m.targetField === 'name')?.csvColumn;
      const phoneMapped = mappings.find(m => m.targetField === 'phone')?.csvColumn;
      if (!nameMapped || !phoneMapped) {
        toast.error('Name and Phone fields are required');
        return;
      }

      const existing = getContacts();
      const normalizePhone = (p: string) => p.replace(/\D/g, '');

      // --- Optimized Cross-Campaign Auto-Hydration ---
      // Pre-build a lookup table for all existing leads in other campaigns to avoid O(N^2) loops
      const allCampaigns = getCampaigns();
      const globalPhoneMap = new Map<string, { contact: Contact; campaignName: string }>();
      
      for (const campaign of allCampaigns) {
        if (campaign.id === activeCampaignId) continue;
        const otherContacts = getContacts(campaign.id);
        for (const other of otherContacts) {
          const otherPhone = normalizePhone(other.phone);
          if (otherPhone && otherPhone.length >= 5) {
            globalPhoneMap.set(otherPhone, { contact: other, campaignName: campaign.name });
          }
        }
      }

      const newContacts: Contact[] = csvData.map(row => {
        const mapped = mapRowToContact(row, mappings);
        const calledMapping = mappings.find(m => m.targetField === 'called');
        const calledRaw = calledMapping?.csvColumn ? row[calledMapping.csvColumn] : undefined;
        const notInterestedMapping = mappings.find(m => m.targetField === 'not_interested');
        const notInterestedRaw = notInterestedMapping?.csvColumn ? row[notInterestedMapping.csvColumn] : undefined;
        
        const newContact: Contact = {
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
          call_recording_drive_url: String(mapped.call_recording_drive_url || ''),
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
          assigned_user_id: mapped.assigned_user_id ? String(mapped.assigned_user_id) : undefined,
          assigned_user_name: mapped.assigned_user_name ? String(mapped.assigned_user_name) : undefined,
          assigned_user_email: mapped.assigned_user_email ? String(mapped.assigned_user_email) : undefined,
          last_called_at: String(mapped.last_called_at || ''),
        };

        // Hydrate from global map if phone exists elsewhere
        const match = globalPhoneMap.get(normalizePhone(newContact.phone));
        if (match) {
          newContact.called = newContact.called || match.contact.called;
          newContact.not_interested = newContact.not_interested || match.contact.not_interested;
          newContact.hidden_from_queue = newContact.hidden_from_queue || match.contact.hidden_from_queue;
          if (match.contact.call_outcome && !newContact.call_outcome) newContact.call_outcome = match.contact.call_outcome;
          if (match.contact.call_date && !newContact.call_date) newContact.call_date = match.contact.call_date;
          if (match.contact.follow_up_date && !newContact.follow_up_date) newContact.follow_up_date = match.contact.follow_up_date;
          
          if (match.contact.notes && !newContact.notes.includes(match.contact.notes.substring(0, 20))) {
            newContact.notes = [newContact.notes, `--- Linked from ${match.campaignName} ---`, match.contact.notes].filter(Boolean).join('\n');
          }
        }

        return newContact;
      }).filter(c => c.name && c.phone);

      // --- Deduplication: Merge by phone number ---
      // Build a map of existing contacts by normalized phone
      const existingByPhone = new Map<string, Contact>();
      for (const c of existing) {
        const p = normalizePhone(c.phone);
        if (p) existingByPhone.set(p, c);
      }

      // Also deduplicate within the CSV itself (keep first occurrence)
      const csvByPhone = new Map<string, Contact>();
      for (const c of newContacts) {
        const p = normalizePhone(c.phone);
        if (!p) continue;
        if (!csvByPhone.has(p)) {
          csvByPhone.set(p, c);
        }
      }

      const finalContacts: Contact[] = [];
      const mergedPhones = new Set<string>();
      let dupeCount = 0;

      // 1. For each CSV contact, merge into existing or add as new
      for (const [phone, csvContact] of csvByPhone) {
        const existingContact = existingByPhone.get(phone);

        if (existingContact) {
          // MERGE: Keep existing contact's ID and data, fill blanks from CSV
          dupeCount++;
          mergedPhones.add(phone);
          
          const merged: Contact = {
            ...existingContact,
            // Only fill in fields that are empty/default in existing
            address: existingContact.address || csvContact.address,
            website: existingContact.website || csvContact.website,
            google_maps_url: existingContact.google_maps_url || csvContact.google_maps_url,
            rating: existingContact.rating || csvContact.rating,
            review_count: existingContact.review_count || csvContact.review_count,
            conversion_confidence_score: existingContact.conversion_confidence_score || csvContact.conversion_confidence_score,
            outreach_tier: (existingContact.outreach_tier && existingContact.outreach_tier !== 3) ? existingContact.outreach_tier : csvContact.outreach_tier,
            average_urgency: (existingContact.average_urgency as string) || (csvContact.average_urgency as string),
            opening_hours: existingContact.opening_hours || csvContact.opening_hours,
            category: existingContact.category || csvContact.category,
            // Always preserve existing call/follow-up data
            called: existingContact.called || csvContact.called,
            call_date: existingContact.call_date || csvContact.call_date,
            call_outcome: existingContact.call_outcome || csvContact.call_outcome,
            not_interested: existingContact.not_interested || csvContact.not_interested,
            follow_up_date: existingContact.follow_up_date || csvContact.follow_up_date,
            hidden_from_queue: existingContact.hidden_from_queue || csvContact.hidden_from_queue,
            call_recording_drive_url: existingContact.call_recording_drive_url || csvContact.call_recording_drive_url,
            // Append CSV notes only if they add new info
            notes: (() => {
              if (!csvContact.notes) return existingContact.notes;
              if (!existingContact.notes) return csvContact.notes;
              // Don't duplicate identical notes
              if (existingContact.notes.includes(csvContact.notes.substring(0, 30))) return existingContact.notes;
              return existingContact.notes + '\n--- Updated from CSV ---\n' + csvContact.notes;
            })(),
          };
          finalContacts.push(merged);
        } else {
          // Brand new contact
          finalContacts.push(csvContact);
        }
      }

      // 2. Keep any existing contacts that weren't in the CSV
      for (const [phone, existingContact] of existingByPhone) {
        if (!mergedPhones.has(phone)) {
          finalContacts.push(existingContact);
        }
      }

      // 3. Keep existing contacts that had empty/invalid phone numbers
      for (const c of existing) {
        const p = normalizePhone(c.phone);
        if (!p && c.name) {
          finalContacts.push(c);
        }
      }

      saveContacts(finalContacts);
      setContacts(finalContacts);
      setShowMapper(false);
      setCsvData([]);

      toast.success(`Imported ${csvByPhone.size} contacts${dupeCount > 0 ? ` (${dupeCount} merged with existing)` : ''}`);
    } catch (err: any) {
      console.error('[CsvManager] confirmMapping failed:', err);
      toast.error(`Import failed: ${err.message || 'Unknown error'}`);
    }
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
    downloadCsv();
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

  const bulkAssignLeads = (userId?: string) => {
    let member = userId ? teamMembers.find(m => m.id === userId) : undefined;
    const updated = contacts.map(c => {
      if (selectedIds.has(c.id)) {
        return {
          ...c,
          assigned_user_id: member?.id,
          assigned_user_name: member ? (member.display_name || member.email.split('@')[0]) : undefined,
          assigned_user_email: member?.email
        };
      }
      return c;
    });
    saveContacts(updated);
    setContacts(updated);
    setSelectedIds(new Set());
    toast.success(`Updated assignments for ${selectedIds.size} leads`);
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

  const handleDeleteFromCurrent = (match: CrossCampaignMatch) => {
    const updated = contacts.filter(c => c.id !== match.contact.id);
    saveContacts(updated);
    setContacts(updated);
    // Remove from matches after deleting from current
    setCrossCheckResults(prev => prev.filter(m => m.contact.id !== match.contact.id));
    toast.success(`Deleted lead from current campaign`);
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

  const handleBulkMergeNotes = () => {
    if (selectedMatches.size === 0) return;
    
    let updatedContacts = [...contacts];
    const matches = Array.from(selectedMatches).map(i => crossCheckResults[i]);
    
    matches.forEach(match => {
      const idx = updatedContacts.findIndex(c => c.id === match.contact.id);
      if (idx === -1) return;
      
      const currentContact = updatedContacts[idx];
      const newNotes = [
        currentContact.notes,
        match.matchedContact.notes ? `\n--- Merged from ${match.matchedCampaignName} ---\n${match.matchedContact.notes}` : ''
      ].filter(Boolean).join('\n').trim();

      updatedContacts[idx] = {
        ...currentContact,
        notes: newNotes,
        address: currentContact.address || match.matchedContact.address,
        website: currentContact.website || match.matchedContact.website,
        category: currentContact.category || match.matchedContact.category,
      };
    });

    saveContacts(updatedContacts);
    setContacts(updatedContacts);
    
    const processedIds = new Set(matches.map(m => m.matchedContact.id));
    setCrossCheckResults(prev => prev.filter(m => !processedIds.has(m.matchedContact.id)));
    setSelectedMatches(new Set());
    toast.success(`Merged notes for ${selectedMatches.size} leads`);
  };

  const handleBulkDeleteFromOther = () => {
    if (selectedMatches.size === 0) return;
    if (!window.confirm(`Delete ${selectedMatches.size} leads from their original campaigns?`)) return;

    const matchesByCampaign = new Map<string, string[]>();
    const matches = Array.from(selectedMatches).map(i => crossCheckResults[i]);
    
    matches.forEach(m => {
      const ids = matchesByCampaign.get(m.matchedCampaignId) || [];
      ids.push(m.matchedContact.id);
      matchesByCampaign.set(m.matchedCampaignId, ids);
    });

    matchesByCampaign.forEach((contactIds, campId) => {
      const otherContacts = getContacts(campId);
      const updated = otherContacts.filter(c => !contactIds.includes(c.id));
      saveContacts(updated, campId);
    });

    const processedIds = new Set(matches.map(m => m.matchedContact.id));
    setCrossCheckResults(prev => prev.filter(m => !processedIds.has(m.matchedContact.id)));
    setSelectedMatches(new Set());
    toast.success(`Deleted ${selectedMatches.size} leads from other campaigns`);
  };

  const handleBulkMoveContacts = () => {
    if (selectedMatches.size === 0) return;
    if (!window.confirm(`Move ${selectedMatches.size} leads here (merging notes and deleting from other campaigns)?`)) return;
    
    let updatedContacts = [...contacts];
    const matches = Array.from(selectedMatches).map(i => crossCheckResults[i]);
    
    // Merge Phase
    matches.forEach(match => {
      const idx = updatedContacts.findIndex(c => c.id === match.contact.id);
      if (idx === -1) return;
      
      const currentContact = updatedContacts[idx];
      const newNotes = [
        currentContact.notes,
        match.matchedContact.notes ? `\n--- Merged from ${match.matchedCampaignName} ---\n${match.matchedContact.notes}` : ''
      ].filter(Boolean).join('\n').trim();

      updatedContacts[idx] = {
        ...currentContact,
        notes: newNotes,
        address: currentContact.address || match.matchedContact.address,
        website: currentContact.website || match.matchedContact.website,
        category: currentContact.category || match.matchedContact.category,
      };
    });

    saveContacts(updatedContacts);
    setContacts(updatedContacts);

    // Delete Phase
    const matchesByCampaign = new Map<string, string[]>();
    matches.forEach(m => {
      const ids = matchesByCampaign.get(m.matchedCampaignId) || [];
      ids.push(m.matchedContact.id);
      matchesByCampaign.set(m.matchedCampaignId, ids);
    });

    matchesByCampaign.forEach((contactIds, campId) => {
      const otherContacts = getContacts(campId);
      const updated = otherContacts.filter(c => !contactIds.includes(c.id));
      saveContacts(updated, campId);
    });

    const processedIds = new Set(matches.map(m => m.matchedContact.id));
    setCrossCheckResults(prev => prev.filter(m => !processedIds.has(m.matchedContact.id)));
    setSelectedMatches(new Set());
    toast.success(`Moved ${selectedMatches.size} leads successfully`);
  };

  const handleBulkDeleteFromCurrent = () => {
    if (selectedMatches.size === 0) return;
    if (!window.confirm(`Delete ${selectedMatches.size} leads from the current campaign?`)) return;

    let updatedContacts = [...contacts];
    const matches = Array.from(selectedMatches).map(i => crossCheckResults[i]);
    const idsToRemove = new Set(matches.map(m => m.contact.id));
    
    updatedContacts = updatedContacts.filter(c => !idsToRemove.has(c.id));

    saveContacts(updatedContacts);
    setContacts(updatedContacts);

    const processedIds = new Set(matches.map(m => m.contact.id));
    setCrossCheckResults(prev => prev.filter(m => !processedIds.has(m.contact.id)));
    setSelectedMatches(new Set());
    toast.success(`Deleted ${selectedMatches.size} leads from current campaign`);
  };

  const distributeLeads = (userId: string, count: number) => {
    const unassigned = contacts.filter(c => !c.assigned_user_id && !c.called);
    if (unassigned.length === 0) {
      toast.error('No unassigned leads available');
      return;
    }

    const member = teamMembers.find(m => m.id === userId);
    if (!member) return;

    // Shuffle and pick
    const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
    const toAssign = shuffled.slice(0, count);
    const toAssignIds = new Set(toAssign.map(c => c.id));

    const updated = contacts.map(c => {
      if (toAssignIds.has(c.id)) {
        return {
          ...c,
          assigned_user_id: userId,
          assigned_user_name: member.display_name || member.email.split('@')[0],
          assigned_user_email: member.email
        };
      }
      return c;
    });

    saveContacts(updated);
    setContacts(updated);
    toast.success(`Assigned ${toAssign.length} leads to ${member.display_name || member.email}`);
  };

  const splitLeadsEvenly = () => {
    const unassigned = contacts.filter(c => !c.assigned_user_id && !c.called);
    if (unassigned.length === 0) {
      toast.error('No unassigned and uncalled leads available');
      return;
    }
    if (teamMembers.length === 0) {
      toast.error('No team members to assign to');
      return;
    }

    const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
    const perPerson = Math.floor(shuffled.length / teamMembers.length);
    if (perPerson === 0) {
      toast.error('Not enough leads to split evenly');
      return;
    }

    const updated = [...contacts];
    teamMembers.forEach((member, i) => {
      const start = i * perPerson;
      const end = (i === teamMembers.length - 1) ? shuffled.length : (i + 1) * perPerson;
      const chunk = shuffled.slice(start, end);
      const chunkIds = new Set(chunk.map(c => c.id));

      for (let j = 0; j < updated.length; j++) {
        if (chunkIds.has(updated[j].id)) {
          updated[j] = {
            ...updated[j],
            assigned_user_id: member.id,
            assigned_user_name: member.display_name || member.email.split('@')[0],
            assigned_user_email: member.email
          };
        }
      }
    });

    saveContacts(updated);
    setContacts(updated);
    toast.success(`Distributed ${shuffled.length} leads between ${teamMembers.length} members`);
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
      const searchClean = s.replace(/[\s\-\(\)\.]/g, '');
      list = list.filter(c => {
        if (c.name.toLowerCase().includes(s)) return true;
        const phoneClean = c.phone.replace(/[\s\-\(\)\.]/g, '');
        if (phoneClean.includes(searchClean)) return true;
        return false;
      });
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
          {teamMembers.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowDistributor(!showDistributor)} 
              className={`gap-1.5 ${showDistributor ? 'bg-primary/10 border-primary text-primary' : ''}`}
            >
              <Shield className="w-4 h-4" />
              Manage Assignments
            </Button>
          )}
          {contacts.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>


      {/* Lead Distribution Section */}
      {showDistributor && teamMembers.length > 0 && (
        <div className="glass-card p-6 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Lead Allocation Control
            </h2>
            <div className="text-sm font-medium text-muted-foreground">
              {contacts.filter(c => !c.assigned_user_id && !c.called).length} leads unassigned
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
              onClick={splitLeadsEvenly}
            >
              <Activity className="w-4 h-4" />
              Split Remaining Leads Evenly
            </Button>
            <p className="text-xs text-muted-foreground flex items-center">
              Randomly distributes all uncalled, unassigned leads across everyone.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map(member => {
              const assignedCount = contacts.filter(c => c.assigned_user_id === member.id).length;
              return (
                <div key={member.id} className="p-4 rounded-xl border border-border bg-accent/20 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm">{member.display_name || member.email}</div>
                      <div className="text-[10px] text-muted-foreground">{member.role}</div>
                    </div>
                    <div className="badge-tier2 px-2 py-1 text-[10px] rounded-lg">
                      {assignedCount} Leads
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-auto">
                    <Input 
                      type="number" 
                      placeholder="Qty" 
                      className="h-8 w-16 text-xs bg-background"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (val > 0) distributeLeads(member.id, val);
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      variant="primary" 
                      className="h-8 flex-1 text-[10px]"
                      onClick={(e) => {
                        const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                        const val = parseInt(input.value);
                        if (val > 0) distributeLeads(member.id, val);
                      }}
                    >
                      Pick Randomly
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground"
              onClick={() => {
                if (window.confirm('Clear all assignments? This will make all leads available to everyone.')) {
                  const updated = contacts.map(c => ({ 
                    ...c, 
                    assigned_user_id: undefined,
                    assigned_user_name: undefined,
                    assigned_user_email: undefined 
                  }));
                  saveContacts(updated);
                  setContacts(updated);
                  toast.success('All assignments cleared');
                }
              }}
            >
              Reset All Assignments
            </Button>
          </div>
        </div>
      )}
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
                  setSelectedMatches(new Set());
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
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-warning/5 border border-warning/20 p-3 rounded-lg mt-4">
                    <p className="text-sm font-medium text-warning flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      {crossCheckResults.length} duplicate{crossCheckResults.length !== 1 ? 's' : ''} found
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-background"
                        onClick={() => {
                          if (selectedMatches.size === crossCheckResults.length) setSelectedMatches(new Set());
                          else setSelectedMatches(new Set(crossCheckResults.map((_, i) => i)));
                        }}
                      >
                        {selectedMatches.size === crossCheckResults.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      
                      {selectedMatches.size > 0 && (
                        <>
                          <div className="w-px h-4 bg-border mx-1" />
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/30" onClick={handleBulkMergeNotes}>
                            <Copy className="w-3.5 h-3.5" />
                            Merge Notes (Keep Both)
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-background hover:bg-success/10 hover:text-success hover:border-success/30" onClick={handleBulkMoveContacts}>
                            <ExternalLink className="w-3.5 h-3.5" />
                            Move to Current (Delete from Other)
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-background hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30" onClick={handleBulkDeleteFromOther}>
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete from Other (Keep Current)
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-background hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30" onClick={handleBulkDeleteFromCurrent}>
                            <UserMinus className="w-3.5 h-3.5" />
                            Delete from Current (Keep Other)
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {crossCheckResults.map((match, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-colors ${selectedMatches.has(i) ? 'bg-primary/5 border-primary/30' : 'hover:bg-accent/50 border-border'}`}>
                        <input 
                          type="checkbox" 
                          className="accent-primary shrink-0" 
                          checked={selectedMatches.has(i)}
                          onChange={e => {
                            const next = new Set(selectedMatches);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            setSelectedMatches(next);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-xs md:text-sm">{match.contact.name}</span>
                          <span className="text-[10px] md:text-xs text-muted-foreground ml-2 font-mono">{match.contact.phone}</span>
                        </div>
                        <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: allCampaigns.find(c => c.id === match.matchedCampaignId)?.color }} />
                          <span className="truncate max-w-[80px]">{match.matchedCampaignName}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity flex-wrap justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 hover:text-primary hover:bg-primary/10"
                            title="Merge Notes to Current (Keep Both)"
                            onClick={() => handleMergeNotes(match)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 hover:text-success hover:bg-success/10"
                            title="Move to Current (Delete from Other)"
                            onClick={() => handleMoveContact(match)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 hover:text-destructive hover:bg-destructive/10"
                            title="Delete from Other (Keep Current)"
                            onClick={() => handleDeleteFromOther(match)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 hover:text-destructive hover:bg-destructive/10"
                            title="Delete from Current (Keep Other)"
                            onClick={() => handleDeleteFromCurrent(match)}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
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
            
            <div className={`mb-4 text-sm px-3 py-2 rounded-md border flex items-center justify-between ${editingContact.assigned_user_id ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'}`}>
              <div className="flex items-center gap-2">
                {editingContact.assigned_user_id ? (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Owned by: <strong>{editingContact.assigned_user_name || editingContact.assigned_user_email || 'Teammate'}</strong></span>
                  </>
                ) : (
                  <>
                    <UserMinus className="w-4 h-4" />
                    <span>Unassigned</span>
                  </>
                )}
              </div>
              {teamMembers.length > 0 && (
                <select
                  className="h-7 text-xs rounded border border-border bg-background px-2 text-foreground"
                  value={editingContact.assigned_user_id || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const member = val ? teamMembers.find(m => m.id === val) : undefined;
                    setEditingContact({
                      ...editingContact,
                      assigned_user_id: member?.id,
                      assigned_user_name: member ? (member.display_name || member.email.split('@')[0]) : undefined,
                      assigned_user_email: member?.email
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.display_name || m.email}</option>
                  ))}
                </select>
              )}
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
                ['call_recording_drive_url', '🎙️ Audio Recording URL'],
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
              
              {teamMembers.length > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <select 
                    className="h-7 text-xs rounded border border-border bg-input px-2"
                    onChange={(e) => {
                       const val = e.target.value;
                       if (val === '') return;
                       if (val === 'unassign') bulkAssignLeads(undefined);
                       else bulkAssignLeads(val);
                       e.target.value = ''; // reset
                    }}
                  >
                    <option value="">Assign selected to...</option>
                    <option value="unassign">Unassigned (Release)</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name || m.email}</option>
                    ))}
                  </select>
                </div>
              )}

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

function hasMeaningfulData(c: Contact): boolean {
  return (
    (c.notes && c.notes.trim().length > 0) ||
    c.called ||
    c.not_interested ||
    (c.call_outcome && c.call_outcome.trim().length > 0) ||
    c.follow_up_date !== '' ||
    c.call_date !== '' ||
    (c.address && c.address.trim().length > 0) ||
    (c.website && c.website.trim().length > 0) ||
    c.rating > 0 ||
    c.review_count > 0 ||
    c.conversion_confidence_score > 0 ||
    c.outreach_tier !== 3 ||
    c.average_urgency !== '' ||
    c.opening_hours !== '' ||
    c.category !== '' ||
    c.hidden_from_queue === true
  );
}

function isIdentical(a: Contact, b: Contact): boolean {
  return (
    a.name === b.name &&
    a.phone === b.phone &&
    a.address === b.address &&
    a.website === b.website &&
    a.google_maps_url === b.google_maps_url &&
    a.rating === b.rating &&
    a.review_count === b.review_count &&
    a.conversion_confidence_score === b.conversion_confidence_score &&
    a.outreach_tier === b.outreach_tier &&
    a.average_urgency === b.average_urgency &&
    a.opening_hours === b.opening_hours &&
    a.notes === b.notes &&
    a.called === b.called &&
    a.call_date === b.call_date &&
    a.call_recording_drive_url === b.call_recording_drive_url &&
    a.not_interested === b.not_interested &&
    a.follow_up_date === b.follow_up_date &&
    a.call_outcome === b.call_outcome &&
    a.category === b.category &&
    a.hidden_from_queue === b.hidden_from_queue
  );
}
