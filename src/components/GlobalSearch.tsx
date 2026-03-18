import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getContacts } from '@/lib/storage';
import { Contact } from '@/types';
import { Search, X, Phone, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const contacts = getContacts();
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const digitQuery = query.replace(/\D/g, '');

    // Score each contact — all query words must match somewhere
    const scored: { contact: Contact; score: number }[] = [];
    for (const c of contacts) {
      const nameLower = c.name.toLowerCase();
      const phonePlain = c.phone.replace(/\D/g, '');
      const categoryLower = (c.category || '').toLowerCase();

      // Check if all query words match in name OR category
      const allWordsMatch = queryWords.every(w =>
        nameLower.includes(w) || categoryLower.includes(w)
      );

      // Phone number match (if query has digits)
      const phoneMatch = digitQuery.length >= 3 && phonePlain.includes(digitQuery);

      if (!allWordsMatch && !phoneMatch) continue;

      // Score: name word-start matches = 10, name contains = 5, phone = 8, category = 3
      let score = 0;
      if (phoneMatch) score += 8;
      for (const w of queryWords) {
        if (nameLower.startsWith(w) || nameLower.includes(` ${w}`)) score += 10;
        else if (nameLower.includes(w)) score += 5;
        if (categoryLower.includes(w)) score += 3;
      }

      scored.push({ contact: c, score });
    }

    scored.sort((a, b) => b.score - a.score);
    setResults(scored.slice(0, 8).map(s => s.contact));
  }, [query]);

  const selectContact = (c: Contact) => {
    setOpen(false);
    // Navigate to queue with this contact selected — always navigate even if on same page
    navigate('/', { state: { selectedId: c.id }, replace: location.pathname === '/' });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-input text-muted-foreground text-sm hover:border-primary/30 transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden md:inline text-[10px] bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] p-4" onClick={() => setOpen(false)}>
      <div className="glass-card w-full max-w-lg animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, phone, category..."
            className="border-0 bg-transparent focus-visible:ring-0 text-sm"
          />
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto p-2">
            {results.map(c => (
              <button
                key={c.id}
                onClick={() => selectContact(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span className="font-mono">{c.phone}</span>
                    {c.category && <span className="bg-muted px-1.5 py-0.5 rounded">{c.category}</span>}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {query && results.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No results found</div>
        )}
        {!query && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Search by name, phone number, address, or category
          </div>
        )}
      </div>
    </div>
  );
}
