'use client';

import { useMemo, useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { PersonSelector } from '@/components/ui/person-selector';
import { usePersonFilter } from '@/contexts/person-filter-context';

interface TravelSearchFilterProps {
  onSearchChange: (q: string) => void;
  personValue?: string | 'all';
  onPersonChange?: (value: string | 'all') => void;
  placeholder?: string;
  includePetsOption?: boolean;
  customOptions?: Array<{ id: string; label: string }>;
  selectedOption?: string | 'all';
  onOptionChange?: (value: string | 'all') => void;
}

export function TravelSearchFilter({
  onSearchChange,
  personValue,
  onPersonChange,
  placeholder,
  includePetsOption = true,
  customOptions,
  selectedOption,
  onOptionChange,
}: TravelSearchFilterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { selectedPersonId } = usePersonFilter();
  const effectiveValue = personValue ?? (selectedPersonId ?? 'all');
  const hasCustomOptions = useMemo(() => customOptions !== undefined, [customOptions]);
  const effectiveCustomSelection = selectedOption ?? 'all';
  const [open, setOpen] = useState(false);

  const filtersActive = (effectiveValue !== 'all') || (hasCustomOptions && effectiveCustomSelection !== 'all');

  const clearFilters = () => {
    onPersonChange?.('all');
    onOptionChange?.('all');
  };

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4 space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder={placeholder || 'Search by destination, provider, notes...'}
            value={searchTerm}
            onChange={(e) => {
              const value = e.target.value;
              setSearchTerm(value);
              onSearchChange(value);
            }}
            className="w-full rounded-xl border border-gray-600/30 bg-background-primary pl-10 pr-3 py-1 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
          />
        </div>
        <div className="flex md:items-center md:justify-end">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={`inline-flex items-center gap-2 px-4 py-1 rounded-xl transition-colors ${
              open || filtersActive
                ? 'bg-gray-700 text-text-primary border border-gray-600'
                : 'bg-background-primary text-text-muted border border-gray-600/30 hover:bg-gray-700/20 hover:text-text-primary'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {filtersActive && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">Active</span>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-gray-600/30 space-y-4">
          <div>
            {hasCustomOptions ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOptionChange?.('all')}
                  className={`px-3 py-1.5 text-xs sm:text-sm rounded-xl border transition-colors ${
                    effectiveCustomSelection === 'all'
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-background-primary text-text-muted border-gray-600/30 hover:text-text-primary hover:border-gray-500'
                  }`}
                >
                  All
                </button>
                {customOptions?.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onOptionChange?.(option.id)}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-xl border transition-colors ${
                      effectiveCustomSelection === option.id
                        ? 'bg-primary-600 text-white border-primary-500'
                        : 'bg-background-primary text-text-muted border-gray-600/30 hover:text-text-primary hover:border-gray-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <PersonSelector
                className="w-full"
                showLabel={false}
                includePets={includePetsOption}
                value={effectiveValue}
                onChange={(value) => onPersonChange?.(value)}
              />
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
