'use client';

import { useEffect, useRef, useState } from 'react';
import { googleMapsLoader } from '@/lib/utils/google-maps-loader';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  required = false
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
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
        setIsLoaded(true);
      })
      .catch(error => {
        console.error('Error loading Google Maps:', error);
      });
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    // Double check that google.maps.places is available
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
      console.warn('[AddressAutocomplete] Google Maps Places API not fully loaded yet');
      return;
    }

    try {
      // Create autocomplete instance
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        fields: ['formatted_address', 'geometry']
      });

      // Add listener for place selection
      const listener = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.formatted_address) {
          onChange(place.formatted_address);
        }
      });

      return () => {
        if (listener) {
          google.maps.event.removeListener(listener);
        }
      };
    } catch (err) {
      console.error('[AddressAutocomplete] Failed to initialize autocomplete:', err);
    }
  }, [isLoaded, onChange]);

  // Helper: accept first visible Google Places suggestion on Tab/Enter
  const getFirstVisiblePacItem = (): HTMLElement | null => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.pac-container .pac-item'));
    for (const el of items) {
      const style = getComputedStyle(el);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
      if (visible) return el;
    }
    return null;
  };

  const acceptFirstPrediction = (done: () => void) => {
    const tryClick = (attempt = 0) => {
      const firstItem = getFirstVisiblePacItem();
      if (firstItem) {
        firstItem.click();
        setTimeout(() => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isAcceptKey = e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey);
    if (!isAcceptKey) return;
    e.preventDefault();
    acceptFirstPrediction(() => {
      const node = inputRef.current;
      node?.blur();
      setTimeout(() => {
        if (!node) return;
        const focusables = Array.from(document.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
        const i = focusables.indexOf(node);
        const next = i >= 0 && i + 1 < focusables.length ? focusables[i + 1] : null;
        next?.focus();
      }, 0);
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}
