'use client';

import { v4 as uuidv4 } from 'uuid';

type AutocompleteResponse = {
  suggestions: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: string; secondaryText?: string };
      types?: string[];
    };
  }>;
};

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1';

const getApiKey = () => {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.');
  }
  return key;
};

const request = async <T>(path: string, init: RequestInit & { fieldMask?: string } = {}): Promise<T> => {
  const { fieldMask, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();
  const headers = new Headers(rest.headers);

  const url = new URL(`${PLACES_ENDPOINT}${path}`);
  url.searchParams.set('key', getApiKey());

  if (fieldMask) {
    const normalized = fieldMask.replace(/\s+/g, '');
    if (method === 'GET') {
      url.searchParams.set('fields', normalized);
    } else {
      headers.set('X-Goog-FieldMask', normalized);
    }
  }

  if (method !== 'GET' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url.toString(), {
    ...rest,
    method,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Places API error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
};

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  rawText?: string;
  types: string[];
}

export interface AutocompleteOptions {
  input: string;
  sessionToken: string;
  languageCode?: string;
  regionCode?: string;
  includedPrimaryTypes?: string[];
}

export const fetchAutocompleteSuggestions = async ({
  input,
  sessionToken,
  languageCode = 'en',
  regionCode,
  includedPrimaryTypes,
}: AutocompleteOptions): Promise<PlaceSuggestion[]> => {
  if (!input.trim()) return [];

  const body: Record<string, unknown> = {
    input,
    languageCode,
    sessionToken,
  };
  if (regionCode) body.regionCode = regionCode;
  if (includedPrimaryTypes?.length) body.includedPrimaryTypes = includedPrimaryTypes;

  const data = await request<AutocompleteResponse>('/places:autocomplete', {
    method: 'POST',
    body: JSON.stringify(body),
    fieldMask: 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
  });

  const getTextValue = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'text' in (value as any)) {
      return (value as { text?: string }).text;
    }
    return undefined;
  };

  const suggestions: PlaceSuggestion[] = [];

  for (const suggestion of data.suggestions ?? []) {
    const prediction = suggestion.placePrediction;
    if (!prediction?.placeId) continue;

    const primary =
      getTextValue(prediction.structuredFormat?.mainText) ||
      prediction.text?.text ||
      getTextValue(prediction.text);
    const secondary = getTextValue(prediction.structuredFormat?.secondaryText);

    suggestions.push({
      placeId: prediction.placeId,
      primaryText: primary || '',
      secondaryText: secondary,
      rawText: prediction.text?.text || primary,
      types: prediction.types ?? [],
    });
  }

  return suggestions;
};

export interface PlaceDetailsOptions {
  placeId: string;
  sessionToken?: string;
  languageCode?: string;
}

export interface PlaceDetailsResult {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

export const fetchPlaceDetails = async ({
  placeId,
  sessionToken,
  languageCode = 'en',
}: PlaceDetailsOptions): Promise<PlaceDetailsResult> => {
  const params = new URLSearchParams();
  if (languageCode) params.append('languageCode', languageCode);
  if (sessionToken) params.append('sessionToken', sessionToken);

  const path = `/places/${encodeURIComponent(placeId)}${params.toString() ? `?${params.toString()}` : ''}`;

  const data = await request<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>(path, {
    method: 'GET',
    fieldMask: 'id,displayName,formattedAddress,location',
  });

  return {
    id: data?.id,
    displayName: data?.displayName?.text,
    formattedAddress: data?.formattedAddress,
    location: data?.location,
  };
};

export const createPlacesSessionToken = () => uuidv4();
