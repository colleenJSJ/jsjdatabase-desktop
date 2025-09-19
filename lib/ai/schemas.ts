import { z } from 'zod';

// Schema version for cache invalidation
export const SCHEMA_VERSION = "1.1.0";

// Main travel extraction schema
export const TravelExtractSchema = z.object({
  airline: z.string(),
  flight_number: z.string().transform(val => val.toUpperCase().trim()),
  departure_airport: z.string().transform(val => val.toUpperCase().trim()),
  arrival_airport: z.string().transform(val => val.toUpperCase().trim()),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  departure_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm format"),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").optional(),
  arrival_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm format").optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").optional(),
  return_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm format").optional(),
  confirmation_number: z.string().optional(),
  travelers: z.array(z.string()).optional(),
  emails: z.array(z.string().email()).optional(),
  notes: z.string().optional()
});

export type TravelExtractResult = z.infer<typeof TravelExtractSchema>;

// Extraction cache entry schema
export const ExtractionCacheSchema = z.object({
  document_id: z.string().uuid(),
  schema_version: z.string(),
  extracted_data: z.any(), // The extracted data (validated separately)
  created_at: z.string(),
  stale_after: z.string()
});

export type ExtractionCache = z.infer<typeof ExtractionCacheSchema>;

// Traveler matching result schema
export const TravelerMatchResultSchema = z.object({
  matched: z.array(z.object({
    name: z.string(),
    id: z.string().uuid()
  })),
  unmatched: z.array(z.string())
});

export type TravelerMatchResult = z.infer<typeof TravelerMatchResultSchema>;

// API response schema
export const TravelExtractResponseSchema = z.object({
  success: z.boolean(),
  data: TravelExtractSchema.optional(),
  matched_travelers: z.array(z.object({
    name: z.string(),
    id: z.string().uuid()
  })).optional(),
  unmatched_travelers: z.array(z.string()).optional(),
  error: z.string().optional(),
  partial: z.boolean().optional(), // Indicates if only some fields were extracted
  cached: z.boolean().optional() // Indicates if result came from cache
});

export type TravelExtractResponse = z.infer<typeof TravelExtractResponseSchema>;

// Claude input types
export type ClaudeTextInput = {
  type: 'text';
  content: string;
};

export type ClaudeImageInput = {
  type: 'image';
  content: {
    type: 'image';
    source: {
      type: 'base64';
      media_type: 'image/png' | 'image/jpeg';
      data: string;
    };
  };
};

export type ClaudeInput = ClaudeTextInput | ClaudeImageInput | {
  type: 'images';
  content: ClaudeImageInput['content'][];
};