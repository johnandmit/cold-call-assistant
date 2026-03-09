import { useState, useCallback, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { Contact, ColumnMapping } from '@/types';
import { getContacts, saveContacts } from '@/lib/storage';
import { autoDetectMappings, mapRowToContact, findDuplicates } from '@/lib/csv-utils';
import { v4 } from '@/lib/uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileSpreadsheet, Download, Search, X, Check, AlertTriangle, Edit3 } from 'lucide-react';
import { toast } from 'sonner';

export default function CsvManager() {
  const [contacts, setContacts] = useState<Contact[]>(getContacts());
  const [search, setSearch] = useState('');
  const [showMapper, setShowMapper] = useState(false);
  const [csvData, setCsvData] = useState<Record<string, any>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
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
    const newContacts: Contact[] = csvData.map(row => {
      const mapped = mapRowToContact(row, mappings);
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
        called: false,
        call_date: '',
        call_recording_drive_url: '',
        not_interested: false,
        follow_up_date: '',
      };
    }).filter(c => c.name && c.phone);

    // Simple duplicate check - skip duplicates by phone
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

  const filtered = search
    ? contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    : contacts;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">CSV Manager</h1>
        {contacts.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        )}
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
            <p className="text-sm text-muted-foreground mb-4">{csvData.length} rows found. Map CSV columns to contact fields.</p>
            <div className="space-y-2 mb-6">
              {mappings.map(m => (
                <div key={m.targetField} className="flex items-center gap-3">
                  <div className="w-44 text-sm font-medium flex items-center gap-1.5">
                    {m.targetField}
                    {m.required && <span className="text-destructive text-xs">*</span>}
                    {m.autoDetected && m.csvColumn && <Check className="w-3 h-3 text-success" />}
                  </div>
                  <select
                    value={m.csvColumn}
                    onChange={e => updateMapping(m.targetField, e.target.value)}
                    className="flex-1 h-9 rounded-md border border-border bg-input px-3 text-sm"
                  >
                    <option value="">— Unmapped —</option>
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

      {/* Contacts Table */}
      {contacts.length > 0 && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-input border-border" />
          </div>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Name', 'Phone', 'Rating', 'Tier', 'Score', 'Urgency', 'Website', 'Notes', 'Called'].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className={`border-b border-border/50 transition-colors ${c.called ? 'bg-success/5' : ''}`}>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{c.phone}</td>
                      <td className="p-3">{c.rating > 0 ? `⭐ ${c.rating}` : '—'}</td>
                      <td className="p-3"><span className={c.outreach_tier === 1 ? 'badge-tier1' : c.outreach_tier === 2 ? 'badge-tier2' : 'badge-tier3'}>T{c.outreach_tier}</span></td>
                      <td className="p-3">{c.conversion_confidence_score > 0 ? `${c.conversion_confidence_score}%` : '—'}</td>
                      <td className="p-3">{c.average_urgency || '—'}</td>
                      <td className="p-3">{c.website ? '✓' : '✗'}</td>
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
                      <td className="p-3">{c.called ? <Check className="w-4 h-4 text-success" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
