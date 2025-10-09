'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  createPlacesSessionToken,
  fetchAutocompleteSuggestions,
  fetchPlaceDetails,
  PlaceSuggestion,
  PlaceDetailsResult,
} from '@/lib/utils/places-client';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  includedPrimaryTypes?: string[];
  formatSelection?: (args: {
    suggestion: PlaceSuggestion;
    details?: PlaceDetailsResult | null;
    fallback: string;
  }) => string;
}

const DEBOUNCE_MS = 200;

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  required = false,
  includedPrimaryTypes,
  formatSelection,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
          includedPrimaryTypes,
        });
        if (requestIdRef.current === currentRequestId) {
          setSuggestions(results);
          setDropdownOpen(results.length > 0);
        }
      } catch (error) {
        console.error('[AddressAutocomplete] autocomplete error:', error);
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

  const applyValue = useCallback((nextValue: string, fallback: string) => {
    const finalValue = nextValue.trim() || fallback;
    setInputValue(finalValue);
    onChange(finalValue);
  }, [onChange]);

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      const primary = suggestion.primaryText?.trim();
      const secondary = suggestion.secondaryText?.trim();
      const raw = suggestion.rawText?.trim();
      const fallback = primary || raw || secondary || '';

      applyValue(fallback, fallback);

      try {
        const token = ensureSessionToken();
        const details = await fetchPlaceDetails({
          placeId: suggestion.placeId,
          sessionToken: token,
        });

        const formatted = formatSelection
          ? formatSelection({ suggestion, details, fallback })
          : details.formattedAddress?.trim() || fallback;

        applyValue(formatted, fallback);
      } catch (error) {
        console.error('[AddressAutocomplete] details error:', error);
      } finally {
        closeDropdown();
        resetSessionToken();
      }
    },
    [applyValue, closeDropdown, formatSelection, resetSessionToken, ensureSessionToken]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    onChange(newValue);
    ensureSessionToken();
  };

  const focusNextElement = (current: HTMLInputElement | null) => {
    if (!current) return;
    const root: HTMLElement = current.form ?? document.body;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('tabindex') !== '-1' &&
        el.getAttribute('aria-hidden') !== 'true'
    );
    const index = focusable.indexOf(current);
    if (index === -1) return;
    const next = focusable[index + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) {
        next.select?.();
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const isForwardTab = event.key === 'Tab' && !event.shiftKey;
    const isEnter = event.key === 'Enter';
    if ((isForwardTab || isEnter) && dropdownOpen && suggestions.length > 0) {
      event.preventDefault();
      const currentInput = event.currentTarget as HTMLInputElement;
      const selectionPromise = handleSelect(suggestions[0]);
      if (isForwardTab) {
        selectionPromise.finally(() => {
          window.requestAnimationFrame(() => focusNextElement(currentInput));
        });
      }
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
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
        placeholder={placeholder}
        required={required}
        className={className || 'w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary'}
      />
      {dropdownOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-600/30 bg-background-secondary shadow-lg overflow-hidden">
          {suggestionItems}
        </div>
      )}
    </div>
  );
}
