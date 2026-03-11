import { useState, useCallback, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { Contact, ColumnMapping } from '@/types';
import { getContacts, saveContacts } from '@/lib/storage';
import { autoDetectMappings, mapRowToContact, parseCalled } from '@/lib/csv-utils';
import { v4 } from '@/lib/uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileSpreadsheet, Download, Search, X, Check, AlertTriangle, Edit3, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';

type FilterState = {
  minRating: number;
  maxTier: number;
  minScore: number;
  urgency: string;
  hasWebsite: string; // 'all' | 'yes' | 'no'
  calledStatus: string; // 'all' | 'yes' | 'no'
};

const DEFAULT_FILTERS: FilterState = {
  minRating: 0,
  maxTier: 3,
  minScore: 0,
  urgency: 'all',
  hasWebsite: 'all',
  calledStatus: 'all',
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
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const calledMapping = mappings.find(m => m.targetField === 'called');

    const newContacts: Contact[] = csvData.map(row => {
      const mapped = mapRowToContact(row, mappings);
      const calledRaw = calledMapping?.csvColumn ? row[calledMapping.csvColumn] : undefined;
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
        notes: '',
        called: parseCalled(calledRaw),
        call_date: '',
        call_recording_drive_url: '',
        not_interested: false,
        follow_up_date: '',
      };
    }).filter(c => c.name && c.phone);

    const existingPhones = new Set(existing.map(c => c.phone.replace(/\D/g, '')));
    const unique = newContacts.filter(c => !existingPhones.has(c.phone.replace(/\D/g, '')));
    const dupeCount = newContacts.length - unique.length;

    const merged = [...existing, ...unique];
    saveContacts(merged);
    setContacts(merged);
    setShowMapper(false);
    setCsvData([]);

    toast.success(`Imported ${unique.length} contacts${dupeCount > 0 ? `, ${dupeCount} duplicates skipped` : ''}`);
  };

  const exportCsv = () => {
    const csv = Papa.unparse(contacts);
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

  // Bulk & individual actions
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

  // Drag-to-select handlers
  const handleRowMouseDown = (idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    e.preventDefault();
    setIsDragging(true);
    setDragStartIdx(idx);
    const id = filtered[idx]?.id;
    if (id) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  const handleRowMouseEnter = (idx: number) => {
    if (!isDragging || dragStartIdx === null) return;
    const start = Math.min(dragStartIdx, idx);
    const end = Math.max(dragStartIdx, idx);
    const newSelected = new Set(selectedIds);
    for (let i = start; i <= end; i++) {
      const id = filtered[i]?.id;
      if (id) newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStartIdx(null);
  };

  const deleteSelected = () => {
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
    const updated = contacts.filter(c => c.id !== id);
    saveContacts(updated);
    setContacts(updated);
    toast.success('Contact deleted');
  };

  const saveEditedContact = () => {
    if (!editingContact) return;
    const updated = contacts.map(c => c.id === editingContact.id ? editingContact : c);
    saveContacts(updated);
    setContacts(updated);
    setEditingContact(null);
    toast.success('Contact updated');
  };

  // Filtering
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
    if (filters.hasWebsite === 'yes') list = list.filter(c => !!c.website);
    if (filters.hasWebsite === 'no') list = list.filter(c => !c.website);
    if (filters.calledStatus === 'yes') list = list.filter(c => c.called);
    if (filters.calledStatus === 'no') list = list.filter(c => !c.called);
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
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                  <Input
                    value={String(editingContact[key] || '')}
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

      {/* Contacts Table */}
      {contacts.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-input border-border" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={showFilters ? 'border-primary text-primary' : ''}>
              Filters {filters !== DEFAULT_FILTERS ? '•' : ''}
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
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-xs h-7 ml-auto">Clear</Button>
            </div>
          )}

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 w-8">
                      <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="accent-primary" />
                    </th>
                    {['Name', 'Phone', 'Rating', 'Tier', 'Score', 'Urgency', 'Website', 'Hours', 'Notes', 'Called', ''].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className={`border-b border-border/50 transition-colors ${c.called ? 'bg-success/5' : ''} ${selectedIds.has(c.id) ? 'bg-primary/5' : ''}`}>
                      <td className="p-3">
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-primary" />
                      </td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{c.phone}</td>
                      <td className="p-3">{c.rating > 0 ? `⭐ ${c.rating}` : '—'}</td>
                      <td className="p-3"><span className={c.outreach_tier === 1 ? 'badge-tier1' : c.outreach_tier === 2 ? 'badge-tier2' : 'badge-tier3'}>T{c.outreach_tier}</span></td>
                      <td className="p-3">{c.conversion_confidence_score > 0 ? `${c.conversion_confidence_score}%` : '—'}</td>
                      <td className="p-3">{c.average_urgency || '—'}</td>
                      <td className="p-3">{c.website ? '✓' : '✗'}</td>
                      <td className="p-3 max-w-[120px]">
                        {c.opening_hours ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={c.opening_hours}>
                            <Clock className="w-3 h-3 shrink-0" />
                            {c.opening_hours.slice(0, 25)}{c.opening_hours.length > 25 ? '…' : ''}
                          </span>
                        ) : '—'}
                      </td>
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
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              Showing {filtered.length} of {contacts.length} contacts
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
