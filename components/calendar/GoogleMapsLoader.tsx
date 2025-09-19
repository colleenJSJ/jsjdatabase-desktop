'use client';

import { useEffect, useState } from 'react';
import { googleMapsLoader } from '@/lib/utils/google-maps-loader';

interface GoogleMapsLoaderProps {
  onLoad?: () => void;
}

export function GoogleMapsLoader({ onLoad }: GoogleMapsLoaderProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already loaded
    if (googleMapsLoader.isLoaded()) {
      setLoaded(true);
      onLoad?.();
      return;
    }

    // Load Google Maps
    googleMapsLoader.load()
      .then(() => {
        setLoaded(true);
        onLoad?.();
      })
      .catch((err) => {
        console.error('Failed to load Google Maps:', err);
        setError('Failed to load Google Maps');
      });
  }, [onLoad]);

  // This component doesn't render anything visible
  // It just ensures Google Maps is loaded
  if (error) {
    console.warn('Google Maps API failed to load:', error);
  }

  return null;
}