'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Lightweight debounce to avoid external types
const debounce = (fn: (...args: any[]) => void, wait: number) => {
  let t: any;
  return (...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};
import { X, Clock, Mail } from 'lucide-react';

interface RecentContactsAutocompleteProps {
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  className?: string;
  multiple?: boolean;
  onSave?: (emails: string[]) => void; // Called when emails should be saved to recent contacts
}

interface Contact {
  name: string;
  email: string;
  source: string;
  use_count?: number;
  last_used?: string;
}

export function RecentContactsAutocomplete({
  value,
  onChange,
  placeholder = 'Enter email addresses (press Enter to add)',
  className = '',
  multiple = false,
  onSave
}: RecentContactsAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse the value prop to get selected emails array
  const selectedEmails = (() => {
    if (Array.isArray(value)) {
      return value.filter(email => email);
    } else if (typeof value === 'string' && value) {
      return value.split(',').map(email => email.trim()).filter(email => email);
    }
    return [];
  })();

  // Log component state for debugging
  useEffect(() => {
    console.log('[RecentContactsAutocomplete] Component mounted/updated');
    console.log('[RecentContactsAutocomplete] Value prop:', value);
    console.log('[RecentContactsAutocomplete] Type of value:', typeof value);
    console.log('[RecentContactsAutocomplete] Parsed emails:', selectedEmails);
  }, [value]);

  // Search recent contacts
  const searchContacts = useCallback(
    debounce(async (query: string) => {
      if (!query || query.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/recent-contacts/search?query=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.contacts || []);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.error('Error searching contacts:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    []
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Get the last part after comma for searching
    const parts = newValue.split(',');
    const lastPart = parts[parts.length - 1].trim();
    
    if (lastPart) {
      searchContacts(lastPart);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Helper to format value for onChange based on multiple prop
  const formatValue = (emails: string[]) => {
    return multiple ? emails : emails.join(', ');
  };

  // Handle blur - commit any uncommitted emails
  const handleBlur = () => {
    if (inputValue.trim() && inputValue.includes('@')) {
      console.log('[RecentContactsAutocomplete] Blur with uncommitted value:', inputValue);
      
      const emails = inputValue.split(',')
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));
      
      if (emails.length > 0) {
        const newEmails = [...selectedEmails, ...emails];
        console.log('[RecentContactsAutocomplete] Auto-committing on blur:', newEmails);
        onChange(formatValue(newEmails));
        setInputValue('');
      }
    }
    setShowSuggestions(false);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (contact: Contact) => {
    const newEmails = [...selectedEmails, contact.email];
    // Immediately call onChange with the new value
    onChange(formatValue(newEmails));
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Handle removing email
  const handleRemoveEmail = (email: string) => {
    const newEmails = selectedEmails.filter(e => e !== email);
    // Immediately call onChange with the new value
    onChange(formatValue(newEmails));
  };

  // Handle Enter key and comma
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('[RecentContactsAutocomplete] Key pressed:', e.key, 'Input value:', inputValue);

    if (e.key === 'Tab' && !e.shiftKey) {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        handleSuggestionSelect(suggestions[0]);
      }
      return;
    }

    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      console.log('[RecentContactsAutocomplete] Processing input:', inputValue);
      console.log('[RecentContactsAutocomplete] Current selectedEmails:', selectedEmails);
      
      // Parse input for multiple emails separated by commas
      const emails = inputValue.split(',')
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));
      
      console.log('[RecentContactsAutocomplete] Filtered emails to add:', emails);
      
      if (emails.length > 0) {
        const newEmails = [...selectedEmails, ...emails];
        const newValue = formatValue(newEmails);
        console.log('[RecentContactsAutocomplete] Calling onChange with:', newValue);
        // Immediately call onChange with the new value
        onChange(newValue);
        console.log('[RecentContactsAutocomplete] onChange called successfully');
        setInputValue('');
        setSuggestions([]);
        setShowSuggestions(false);
      } else {
        console.log('[RecentContactsAutocomplete] No valid emails found in input');
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedEmails.length > 0) {
      // Remove last email if backspace pressed on empty input
      const newEmails = selectedEmails.slice(0, -1);
      // Immediately call onChange with the new value
      onChange(formatValue(newEmails));
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // Split by common separators
    const emails = pastedText
      .split(/[,;\s]+/)
      .map(email => email.trim())
      .filter(email => email && email.includes('@'));
    
    if (emails.length > 0) {
      const newEmails = [...selectedEmails, ...emails];
      // Immediately call onChange with the new value
      onChange(formatValue(newEmails));
      setInputValue('');
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save emails to recent contacts when value changes (optional)
  useEffect(() => {
    if (onSave && selectedEmails.length > 0) {
      // Debounce saving to avoid too many API calls
      const timer = setTimeout(() => {
        onSave(selectedEmails);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [value, onSave]);

  return (
    <div className="space-y-2">
      {/* Selected emails */}
      {selectedEmails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedEmails.map(email => (
            <div
              key={email}
              className="flex items-center gap-1 px-2 py-1 bg-gray-700 text-white rounded-md text-sm"
            >
              <Mail className="h-3 w-3" />
              <span>{email}</span>
              <button
                type="button"
                onClick={() => handleRemoveEmail(email)}
                className="hover:text-red-400 ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={selectedEmails.length > 0 ? 'Add more emails...' : placeholder}
          className={className || 'w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700'}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && (suggestions.length > 0 || isLoading) && (
          <div
            ref={dropdownRef}
            className="absolute z-10 w-full mt-1 bg-background-secondary border border-gray-600/30 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
            ) : (
              suggestions.map((contact, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSuggestionSelect(contact)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-700/50 flex items-center justify-between group"
                >
                  <div className="flex-1">
                    <div className="text-sm text-text-primary">{contact.name}</div>
                    <div className="text-xs text-gray-400">{contact.email}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {contact.use_count && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {contact.use_count}x
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
            {suggestions.length === 0 && !isLoading && inputValue.includes('@') && (
              <div className="px-3 py-2 text-sm text-gray-400">
                Press Enter to add "{inputValue.trim()}"
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Helper text (reduced) */}
      {inputValue && inputValue.includes('@') && (
        <div className="mt-1">
          <p className="text-xs text-yellow-500">
            ⚠️ Uncommitted: "{inputValue}" - press Enter to add
          </p>
        </div>
      )}
    </div>
  );
}
