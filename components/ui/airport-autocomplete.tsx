'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  createPlacesSessionToken,
  fetchAutocompleteSuggestions,
  fetchPlaceDetails,
  PlaceSuggestion,
} from '@/lib/utils/places-client';

interface AirportAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  inputRef?: React.Ref<HTMLInputElement>;
}

const DEBOUNCE_MS = 200;

export function AirportAutocomplete({
  value,
  onChange,
  placeholder = 'Search airports...',
  className,
  inputProps,
  inputRef,
}: AirportAutocompleteProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);

  const ensureSessionToken = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createPlacesSessionToken();
    }
    return sessionTokenRef.current;
  };

  const resetSessionToken = () => {
    sessionTokenRef.current = createPlacesSessionToken();
  };

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const runAutocomplete = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSuggestions([]);
        setDropdownOpen(false);
        return;
      }

      const token = ensureSessionToken();
      const currentRequestId = ++requestIdRef.current;
      setIsLoading(true);

      try {
        const results = await fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: token,
          languageCode: 'en',
          includedPrimaryTypes: ['airport'],
        });
        if (requestIdRef.current === currentRequestId) {
          setSuggestions(results);
          setDropdownOpen(results.length > 0);
        }
      } catch (error) {
        console.error('[AirportAutocomplete] autocomplete error:', error);
        if (requestIdRef.current === currentRequestId) {
          setSuggestions([]);
          setDropdownOpen(false);
        }
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runAutocomplete(inputValue), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, runAutocomplete]);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setSuggestions([]);
  }, []);

  const extractAirportCode = (text?: string) => {
    if (!text) return null;
    const match = text.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : null;
  };

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      const basePrimary = suggestion.primaryText?.trim();
      const baseSecondary = suggestion.secondaryText?.trim();
      const baseRaw = suggestion.rawText?.trim();

      const fallback = basePrimary || baseRaw || baseSecondary || '';
      let formatted = fallback;

      const applyValue = (value: string) => {
        const finalValue = value.trim() || fallback;
        setInputValue(finalValue);
        onChange(finalValue);
      };

      applyValue(formatted);

      try {
        const token = ensureSessionToken();
        const details = await fetchPlaceDetails({
          placeId: suggestion.placeId,
          sessionToken: token,
        });

        const code =
          extractAirportCode(basePrimary) ||
          extractAirportCode(baseRaw) ||
          extractAirportCode(details.displayName);

        const name = details.displayName?.trim() || baseSecondary || basePrimary || baseRaw;

        const parts = [code, name].filter(Boolean);
        formatted = parts.length > 0 ? parts.join(' - ') : fallback;
        applyValue(formatted);
      } catch (error) {
        console.error('[AirportAutocomplete] details error:', error);
      } finally {
        closeDropdown();
        resetSessionToken();
      }
    },
    [closeDropdown, onChange]
  );

  const assignInputRef = (node: HTMLInputElement | null) => {
    internalInputRef.current = node;
    if (!inputRef) return;
    if (typeof inputRef === 'function') {
      inputRef(node);
    } else {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    onChange(newValue);
    ensureSessionToken();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && dropdownOpen && suggestions.length > 0) {
      event.preventDefault();
      handleSelect(suggestions[0]);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => setDropdownOpen(false), 120);
  };

  const suggestionItems = useMemo(() => {
    if (!dropdownOpen) return null;
    if (isLoading) {
      return <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>;
    }
    if (suggestions.length === 0) {
      return <div className="px-3 py-2 text-sm text-gray-500">No matches</div>;
    }
    return suggestions.map((suggestion) => (
      <button
        key={suggestion.placeId}
        type="button"
        className="w-full px-3 py-2 text-left hover:bg-gray-700/40"
        onMouseDown={(event) => {
          event.preventDefault();
          handleSelect(suggestion);
        }}
      >
        <div className="text-sm text-text-primary">{suggestion.primaryText}</div>
        {suggestion.secondaryText && (
          <div className="text-xs text-gray-400">{suggestion.secondaryText}</div>
        )}
      </button>
    ));
  }, [dropdownOpen, isLoading, suggestions, handleSelect]);

  return (
    <div className="relative">
      <Input
        ref={assignInputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
        placeholder={placeholder}
        className={className}
        {...inputProps}
      />
      {dropdownOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-600/30 bg-background-secondary shadow-lg overflow-hidden">
          {suggestionItems}
        </div>
      )}
    </div>
  );
}
