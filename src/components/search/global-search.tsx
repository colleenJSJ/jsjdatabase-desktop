'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  badge: string;
  path: string;
  action?: { open?: string; id?: string };
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composingRef = useRef(false);
  const cacheRef = useRef<Map<string, { ts: number; results: SearchResult[] }>>(new Map());

  const CACHE_TTL_MS = 30_000; // 30s client cache for repeated queries

  // Cmd/Ctrl+K focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click outside to close results
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced fetch with Abort + client cache + IME-safe handling
  useEffect(() => {
    const h = setTimeout(async () => {
      const q = query.trim();
      if (!q || q.length < 2 || composingRef.current) { return; }

      // Serve from cache if fresh
      const cached = cacheRef.current.get(q);
      const now = Date.now();
      if (cached && (now - cached.ts) < CACHE_TTL_MS) {
        setResults(cached.results);
        setActiveIndex(0);
        setOpen(cached.results.length > 0);
        return;
      }

      // Abort previous request
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`, { signal: ac.signal });
        if (!res.ok) return;
        const data = await res.json();
        const r: SearchResult[] = data.results || [];
        cacheRef.current.set(q, { ts: now, results: r });
        setResults(r);
        setActiveIndex(0);
        setOpen(r.length > 0);
      } catch (e: any) {
        if (e?.name === 'AbortError') return; // ignore aborted
      }
    }, 250);
    return () => clearTimeout(h);
  }, [query]);

  const handleSelect = (r: SearchResult) => {
    const suffix = r.action?.open && r.action?.id ? `?open=${encodeURIComponent(`${r.action.open}:${r.action.id}`)}` : '';
    router.push(`${r.path}${suffix}`);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl">
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background-primary border border-gray-600/30 focus-within:ring-2 focus-within:ring-gray-700">
        <Search className="h-4 w-4 text-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => { composingRef.current = false; setQuery((e.target as HTMLInputElement).value); }}
          onChange={(e) => { if (!composingRef.current) setQuery(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); handleSelect(results[activeIndex]); }
          }}
          placeholder="Search everything..."
          className="w-full bg-transparent outline-none text-text-primary placeholder-text-muted"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full rounded-md border border-gray-600/30 bg-background-secondary shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={`${r.type}:${r.id}`}
              onClick={() => handleSelect(r)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-700/30 ${i === activeIndex ? 'bg-gray-700/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-text-primary font-medium truncate">{r.title}</div>
                <span className="text-xs text-text-muted ml-2">{r.badge}</span>
              </div>
              {r.subtitle && <div className="text-xs text-text-muted truncate">{r.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
