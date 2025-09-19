'use client';

import { useEffect, useRef, useState } from 'react';
import { googleMapsLoader } from '@/lib/utils/google-maps-loader';

interface DestinationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function DestinationAutocomplete({
  value,
  onChange,
  placeholder = 'City, Country or Location',
  className = '',
  required = false
}: DestinationAutocompleteProps) {
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
      console.warn('[DestinationAutocomplete] Google Maps Places API not fully loaded yet');
      return;
    }

    try {
      // Create autocomplete instance for travel destinations
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['(cities)'], // Focus on cities for travel destinations
        fields: ['name', 'formatted_address', 'place_id']
      });

      // Add listener for place selection
      const listener = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.name) {
          // Use the place name for destinations (e.g., "Paris" instead of full address)
          onChange(place.name);
        } else if (place?.formatted_address) {
          onChange(place.formatted_address);
        }
      });

      return () => {
        if (listener) {
          google.maps.event.removeListener(listener);
        }
      };
    } catch (err) {
      console.error('[DestinationAutocomplete] Failed to initialize autocomplete:', err);
    }
  }, [isLoaded, onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}