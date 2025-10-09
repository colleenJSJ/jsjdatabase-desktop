'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

type Contact = { id: string; name: string; contact_type: string };

interface ContactAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  contacts?: Contact[];
  placeholder?: string;
  className?: string;
  filterType?: string; // Filter by contact type (e.g., 'airline', 'driver', etc.)
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  inputRef?: React.Ref<HTMLInputElement>;
}

// Common airlines fallback data
const commonAirlines: Contact[] = [
  { id: 'airline-1', name: 'American Airlines', contact_type: 'airline' },
  { id: 'airline-2', name: 'Delta Air Lines', contact_type: 'airline' },
  { id: 'airline-3', name: 'United Airlines', contact_type: 'airline' },
  { id: 'airline-4', name: 'Southwest Airlines', contact_type: 'airline' },
  { id: 'airline-5', name: 'JetBlue Airways', contact_type: 'airline' },
  { id: 'airline-6', name: 'Alaska Airlines', contact_type: 'airline' },
  { id: 'airline-7', name: 'Spirit Airlines', contact_type: 'airline' },
  { id: 'airline-8', name: 'Frontier Airlines', contact_type: 'airline' },
  { id: 'airline-9', name: 'British Airways', contact_type: 'airline' },
  { id: 'airline-10', name: 'Air France', contact_type: 'airline' },
  { id: 'airline-11', name: 'Lufthansa', contact_type: 'airline' },
  { id: 'airline-12', name: 'Emirates', contact_type: 'airline' },
  { id: 'airline-13', name: 'Qatar Airways', contact_type: 'airline' },
  { id: 'airline-14', name: 'Singapore Airlines', contact_type: 'airline' },
  { id: 'airline-15', name: 'Air Canada', contact_type: 'airline' },
];

export function ContactAutocomplete({
  value,
  onChange,
  contacts,
  placeholder = 'Type to search...',
  className,
  filterType,
  inputProps,
  inputRef,
}: ContactAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);

  const assignInputRef = (node: HTMLInputElement | null) => {
    internalInputRef.current = node;
    if (!inputRef) return;
    if (typeof inputRef === 'function') {
      inputRef(node);
    } else {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value) {
      setFilteredContacts([]);
      setIsOpen(false);
      return;
    }

    // Use airline fallback if filtering for airlines and no airline contacts exist
    const baseContacts = contacts ?? [];
    let searchContacts = baseContacts;
    if (filterType === 'airline') {
      const hasAirlineContacts = searchContacts.some(c => c.contact_type === 'airline');
      if (!hasAirlineContacts) {
        searchContacts = commonAirlines;
      }
    }

    const filtered = searchContacts.filter(contact => {
      const matchesName = contact.name.toLowerCase().includes(value.toLowerCase());
      const matchesType = !filterType || contact.contact_type === filterType;
      return matchesName && matchesType;
    });

    // Only update state when results actually change to avoid loops
    setFilteredContacts((prev) => {
      const sameLength = prev.length === filtered.length;
      const sameContent = sameLength && prev.every((p, i) => p.id === filtered[i].id);
      if (!sameContent) return filtered;
      return prev;
    });
    setIsOpen(filtered.length > 0);
    setActiveIndex(-1);
  }, [value, filterType, contacts ? contacts.length : 0]);

  const handleSelect = (contact: Contact) => {
    onChange(contact.name);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(-1);
        }}
        placeholder={placeholder}
        className={className}
        ref={assignInputRef}
        {...inputProps}
        onBlur={() => {
          // Close dropdown when tabbing away
          setTimeout(() => setIsOpen(false), 0);
        }}
        onFocus={() => {
          if (filteredContacts.length > 0) {
            setIsOpen(true);
          }
        }}
        onKeyDown={(e) => {
          const isAcceptKey = e.key === 'Enter';
          if (filteredContacts.length > 0 && isAcceptKey) {
            const idx = activeIndex >= 0 ? activeIndex : -1;
            if (idx >= 0) {
              e.preventDefault();
              handleSelect(filteredContacts[idx]);
              setIsOpen(false);
              return;
            }
          }

          // Navigation inside the open list
          if (isOpen && filteredContacts.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = prev + 1;
                return next >= filteredContacts.length ? 0 : next;
              });
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = prev - 1;
                return next < 0 ? filteredContacts.length - 1 : next;
              });
              return;
            }
            if (e.key === 'Escape') {
              setIsOpen(false);
              setActiveIndex(-1);
              return;
            }
          }
        }}
      />
      
      {isOpen && filteredContacts.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-background-secondary border border-gray-600/30 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredContacts.map((contact, idx) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              className={`w-full px-3 py-2 text-left transition-colors text-text-primary text-sm ${
                idx === activeIndex ? 'bg-gray-700/50' : 'hover:bg-gray-700/50'
              }`}
            >
              <div className="font-medium">{contact.name}</div>
              {contact.contact_type && (
                <div className="text-xs text-text-muted capitalize">
                  {contact.contact_type.replace('_', ' ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
