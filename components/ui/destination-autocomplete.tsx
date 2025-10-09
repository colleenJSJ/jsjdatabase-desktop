'use client';

import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import type { PlaceDetailsResult, PlaceSuggestion } from '@/lib/utils/places-client';

interface DestinationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

const INCLUDED_TYPES = ['locality', 'administrative_area_level_1', 'country'];

export function DestinationAutocomplete({
  value,
  onChange,
  placeholder = 'City, Country or Location',
  className = '',
  required = false,
}: DestinationAutocompleteProps) {
  const formatSelection = ({
    suggestion,
    details,
    fallback,
  }: {
    suggestion: PlaceSuggestion;
    details?: PlaceDetailsResult | null;
    fallback: string;
  }): string => {
    const name = details?.displayName?.trim() || suggestion.primaryText?.trim() || '';
    const secondary = suggestion.secondaryText?.trim();
    const parts = [name, secondary].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : fallback;
  };

  return (
    <AddressAutocomplete
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      required={required}
      includedPrimaryTypes={INCLUDED_TYPES}
      formatSelection={formatSelection}
    />
  );
}
