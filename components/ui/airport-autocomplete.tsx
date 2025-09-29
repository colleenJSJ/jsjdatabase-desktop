'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { googleMapsLoader } from '@/lib/utils/google-maps-loader';
import { Input } from '@/components/ui/input';

interface AirportAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AirportAutocomplete({
  value,
  onChange,
  placeholder = 'Search for airport...',
  className
}: AirportAutocompleteProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    // Check if already loaded
    if (googleMapsLoader.isLoaded()) {
      setIsLoaded(true);
      return;
    }

    // Load Google Maps using singleton loader
    googleMapsLoader.load()
      .then(() => {
        console.log('[AirportAutocomplete] Google Maps loaded successfully');
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('[AirportAutocomplete] Failed to load Google Maps:', err);
        setError('Failed to load Google Maps');
      });
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    // Double check that google.maps.places is available
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
      console.warn('[AirportAutocomplete] Google Maps Places API not fully loaded yet');
      return;
    }

    try {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        // Use establishment to allow airports and airline counters; filter in selection
        types: ['establishment'],
        fields: ['name', 'place_id', 'formatted_address', 'types']
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.name) {
          const airportCode = extractAirportCode(place.name);
          const formattedValue = airportCode || place.name;
          console.log('[AirportAutocomplete] Place selected:', formattedValue);
          onChange(formattedValue);
        }
      });

      autocompleteRef.current = autocomplete;
      console.log('[AirportAutocomplete] Autocomplete initialized');
    } catch (err) {
      console.error('[AirportAutocomplete] Failed to initialize autocomplete:', err);
      setError('Failed to initialize airport search');
    }
  }, [isLoaded, onChange]);

  const extractAirportCode = (placeName: string): string | null => {
    const match = placeName.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : null;
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Only update if the input is being actively typed
    // This prevents clearing values when autocomplete isn't ready
    const newValue = e.target.value;
    onChange(newValue);
  }, [onChange]);

  // Utility to find first visible Google Places suggestion
  const getFirstVisiblePacItem = (): HTMLElement | null => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.pac-container .pac-item'));
    for (const el of items) {
      const style = getComputedStyle(el);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
      if (visible) return el;
    }
    return null;
  };

  // Attempt to accept first suggestion; retry briefly if DOM not ready
  const acceptFirstPrediction = (done: () => void) => {
    const tryClick = (attempt = 0) => {
      const firstItem = getFirstVisiblePacItem();
      if (firstItem) {
        firstItem.click();
        // Small delay for Google to populate the input value
        setTimeout(() => {
          // Use whatever Google put in the input
          const committed = inputRef.current?.value || '';
          if (committed) onChange(committed);
          done();
        }, 0);
      } else if (attempt < 5) {
        setTimeout(() => tryClick(attempt + 1), 30);
      } else {
        done();
      }
    };
    tryClick();
  };

  // Handle Tab/Enter to accept suggestion and move focus
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isAcceptKey = e.key === 'Tab' && !e.shiftKey || e.key === 'Enter';
    if (!isAcceptKey) return;
    e.preventDefault();
    acceptFirstPrediction(() => {
      // Blur to close any remaining dropdown
      inputRef.current?.blur();
      // Move to next focusable after DOM updates
      setTimeout(() => {
        if (!inputRef.current) return;
        const focusables = Array.from(document.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
        const idx = focusables.indexOf(inputRef.current);
        const next = idx >= 0 && idx + 1 < focusables.length ? focusables[idx + 1] : null;
        next?.focus();
      }, 0);
    });
  };

  if (error) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      placeholder={isLoaded ? placeholder : 'Loading...'}
      className={className}
      disabled={!isLoaded}
    />
  );
}
