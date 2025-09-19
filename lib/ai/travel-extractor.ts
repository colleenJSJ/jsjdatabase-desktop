import Anthropic from '@anthropic-ai/sdk';
import Fuse from 'fuse.js';
import { createClient } from '@/lib/supabase/server';
import { getTimezoneForAirport } from '@/lib/utils/airport-timezones';
import { 
  SCHEMA_VERSION,
  TravelExtractSchema, 
  TravelExtractResult,
  TravelExtractResponse,
  TravelerMatchResult,
  ClaudeInput,
  ExtractionCache
} from './schemas';
import { processDocument } from './document-processors';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Get cached extraction if exists and not stale
 */
async function getCachedExtraction(
  supabase: any,
  documentId: string,
  schemaVersion: string
): Promise<ExtractionCache | null> {
  try {
    const { data, error } = await supabase
      .from('extraction_cache')
      .select('*')
      .eq('document_id', documentId)
      .eq('schema_version', schemaVersion)
      .gt('stale_after', new Date().toISOString())
      .single();
    
    if (error || !data) return null;
    return data;
  } catch (error) {
    console.error('Error fetching cached extraction:', error);
    return null;
  }
}

/**
 * Cache extraction result
 */
async function cacheExtraction(
  supabase: any,
  documentId: string,
  userId: string,
  result: any,
  schemaVersion: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('extraction_cache')
      .upsert({
        document_id: documentId,
        user_id: userId,
        schema_version: schemaVersion,
        extracted_data: result,
        created_at: new Date().toISOString(),
        stale_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      }, {
        onConflict: 'document_id,schema_version'
      });
    
    if (error) {
      console.error('Error caching extraction:', error);
    }
  } catch (error) {
    console.error('Error caching extraction:', error);
  }
}

/**
 * Two-pass traveler matching against family members
 */
export async function twoPassTravelerMatching(
  travelers: string[],
  familyMembers: any[]
): Promise<TravelerMatchResult> {
  const matched: Array<{ name: string; id: string }> = [];
  const unmatched: string[] = [];
  
  if (!travelers || travelers.length === 0) {
    return { matched, unmatched };
  }
  
  for (const traveler of travelers) {
    // Normalize traveler name (handle all caps, extra spaces, etc.)
    const normalizedTraveler = traveler.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Pass 1: Exact match (case/space-insensitive)
    const exactMatch = familyMembers.find(member => {
      const normalizedMember = (member.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return normalizedMember === normalizedTraveler;
    });
    
    if (exactMatch) {
      matched.push({ name: exactMatch.name, id: exactMatch.id }); // Already using canonical name
      continue;
    }
    
    // Pass 1.5: Handle full names with middle names or formal names
    // Check if the traveler name contains the family member's name as a subset
    const partialMatch = familyMembers.find(member => {
      const normalizedMember = (member.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const memberNameParts = normalizedMember.split(' ');
      const travelerNameParts = normalizedTraveler.split(' ');
      
      // Check if all parts of the family member's name appear in the traveler's name
      // This handles cases like "CLAIRE OREON KINGMAN JOHNSON" matching "Claire Johnson"
      if (memberNameParts.length === 2) {
        const [firstName, lastName] = memberNameParts;
        return travelerNameParts.some(part => part === firstName) && 
               travelerNameParts.some(part => part === lastName);
      }
      
      // Also check if the traveler name contains the member name as a substring
      return normalizedTraveler.includes(normalizedMember) || 
             normalizedMember.includes(normalizedTraveler);
    });
    
    if (partialMatch) {
      matched.push({ name: partialMatch.name, id: partialMatch.id });
      continue;
    }
    
    // Pass 2: Fuzzy match with Fuse.js (threshold 0.8 similarity)
    // Create variations of the traveler name for better matching
    const travelerVariations = [
      traveler, // Original
      normalizedTraveler, // Normalized
    ];
    
    // If the name has multiple parts, also try first + last name combination
    const travelerParts = normalizedTraveler.split(' ');
    if (travelerParts.length > 2) {
      // Try first and last name only (e.g., "claire johnson" from "claire oreon kingman johnson")
      travelerVariations.push(`${travelerParts[0]} ${travelerParts[travelerParts.length - 1]}`);
    }
    
    let fuzzyMatch = null;
    for (const variation of travelerVariations) {
      const fuse = new Fuse(familyMembers, {
        keys: ['name'],
        threshold: 0.3, // Slightly more lenient for variations
      });
      
      const fuzzyResults = fuse.search(variation);
      if (fuzzyResults.length > 0 && fuzzyResults[0].score !== undefined && fuzzyResults[0].score <= 0.3) {
        fuzzyMatch = fuzzyResults[0].item;
        break;
      }
    }
    
    if (fuzzyMatch) {
      matched.push({ name: fuzzyMatch.name, id: fuzzyMatch.id });
    } else {
      unmatched.push(traveler);
    }
  }
  
  return { matched, unmatched };
}

/**
 * Build Claude prompt for extraction
 */
function buildClaudePrompt(documentInput: ClaudeInput): Anthropic.MessageParam {
  const systemPrompt = `You are a travel document extraction engine. 
CRITICAL RULES:
1. Output ONLY valid JSON that matches the provided schema
2. Never include explanatory text outside the JSON
3. Omit any field you cannot confidently extract
4. For airports, prefer IATA codes (3 letters like JFK, LAX)
5. For dates use YYYY-MM-DD format
6. For times use HH:mm format (24-hour)
7. For outbound flights/trips: Extract arrival_time and arrival_date (if different day) when present
8. If the document shows a one-way trip, omit return_date and return_time
9. Extract traveler names exactly as they appear in the document, preserving any full names with middle names
10. If names appear in all caps, keep them as shown (the system will handle normalization)`;

  const schemaExample = {
    airline: "string (e.g., 'Delta Airlines', 'United', 'AA')",
    flight_number: "string (e.g., 'DL123', 'UA456')",
    departure_airport: "string (IATA code preferred, e.g., 'JFK', 'LAX')",
    arrival_airport: "string (IATA code preferred, e.g., 'ORD', 'SFO')",
    departure_date: "string (YYYY-MM-DD format)",
    departure_time: "string (HH:mm format, 24-hour)",
    arrival_date: "string (YYYY-MM-DD format, optional if arrival is same day as departure)",
    arrival_time: "string (HH:mm format, optional - extract if present in document)",
    return_date: "string (YYYY-MM-DD format, optional for round trips)",
    return_time: "string (HH:mm format, optional for round trips)",
    confirmation_number: "string (booking reference, optional)",
    travelers: ["array of traveler names (optional)"],
    emails: ["array of email addresses (optional)"],
    notes: "string (any additional relevant information, optional)"
  };

  const userPromptText = `Extract travel details from this document and output JSON matching this exact schema:
${JSON.stringify(schemaExample, null, 2)}

Examples:
One-way with arrival time: {"airline":"Delta","flight_number":"DL123","departure_airport":"JFK","arrival_airport":"LAX","departure_date":"2025-09-10","departure_time":"15:30","arrival_time":"17:45"}

Overnight flight: {"airline":"United","flight_number":"UA890","departure_airport":"SFO","arrival_airport":"LHR","departure_date":"2025-09-10","departure_time":"21:00","arrival_date":"2025-09-11","arrival_time":"15:30"}

Round-trip: {"airline":"United","flight_number":"UA456","departure_airport":"SFO","arrival_airport":"ORD","departure_date":"2025-09-10","departure_time":"08:00","arrival_time":"14:30","return_date":"2025-09-15","return_time":"17:30","confirmation_number":"ABC123","travelers":["John Smith","Jane Smith"]}

One-way no arrival: {"airline":"American","flight_number":"AA789","departure_airport":"LAX","arrival_airport":"JFK","departure_date":"2025-09-10","departure_time":"09:00"}`;

  // Build message content based on input type
  let content: Anthropic.MessageParam['content'];
  
  if (documentInput.type === 'text') {
    content = [
      { type: 'text', text: userPromptText },
      { type: 'text', text: '\n\nDocument content:\n' + documentInput.content }
    ];
  } else if (documentInput.type === 'image') {
    content = [
      { type: 'text', text: userPromptText },
      documentInput.content
    ];
  } else if (documentInput.type === 'images') {
    content = [
      { type: 'text', text: userPromptText },
      ...documentInput.content
    ];
  } else {
    content = userPromptText;
  }

  return {
    role: 'user',
    content
  };
}

/**
 * Extract travel details from a document using Claude
 */
export async function extractTravelDetails(
  documentId: string,
  userId: string
): Promise<TravelExtractResponse> {
  const supabase = await createClient();
  
  try {
    // Check cache first
    const cached = await getCachedExtraction(supabase, documentId, SCHEMA_VERSION);
    if (cached) {
      console.log('Using cached extraction for document:', documentId);
      return {
        success: true,
        data: cached.extracted_data.data,
        matched_travelers: cached.extracted_data.matched_travelers,
        unmatched_travelers: cached.extracted_data.unmatched_travelers,
        cached: true
      };
    }
    
    // Fetch document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();
    
    if (docError || !document) {
      throw new Error('Document not found or access denied');
    }
    
    // Fetch document content from storage
    let documentContent: Buffer | string;
    const inferMime = (t?: string | null, name?: string | null) => {
      const type = (t || '').toLowerCase();
      if (type.includes('/')) return type;
      if (type === 'plain') return 'text/plain';
      if (type === 'pdf') return 'application/pdf';
      if (type === 'png') return 'image/png';
      if (type === 'jpg' || type === 'jpeg') return 'image/jpeg';
      const n = (name || '').toLowerCase();
      if (n.endsWith('.pdf')) return 'application/pdf';
      if (n.endsWith('.png')) return 'image/png';
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
      if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html';
      if (n.endsWith('.txt')) return 'text/plain';
      if (n.endsWith('.eml')) return 'message/rfc822';
      return 'application/octet-stream';
    };
    let mimeType = inferMime(document.file_type || document.mime_type, document.file_name);
    
    // Check if document has content stored directly
    if (document.content) {
      documentContent = document.content;
    } else if (document.file_url || document.url || document.file_path || document.file_name) {
      // Fetch from storage URL
      const fileUrl = document.file_url || document.url || document.file_path;
      
      try {
        // If it's a signed URL from storage (Backblaze/Supabase)
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }
        documentContent = Buffer.from(await response.arrayBuffer());
      } catch (fetchError) {
        console.error('Error fetching document from URL:', fetchError);
        
        // Try to get a signed URL if the direct URL fails (Supabase Storage)
        if (!document.file_url && !document.url && document.file_path) {
          const { data: signedUrlData, error: urlError } = await supabase
            .storage
            .from('documents')
            .createSignedUrl(document.file_path, 60); // 60 seconds expiry
          
          if (urlError || !signedUrlData) {
            throw new Error('Failed to generate signed URL for document');
          }
          
          const response = await fetch(signedUrlData.signedUrl);
          if (!response.ok) {
            throw new Error('Failed to fetch document from signed URL');
          }
          documentContent = Buffer.from(await response.arrayBuffer());
        } else if (document.file_name) {
          // As a last resort, if we only have a path-like file_name, attempt public fetch
          try {
            const resp2 = await fetch(document.file_name);
            if (!resp2.ok) throw new Error('Fetch by file_name failed');
            documentContent = Buffer.from(await resp2.arrayBuffer());
          } catch (e) {
            throw fetchError;
          }
        } else {
          throw fetchError;
        }
      }
    } else {
      throw new Error('Document has no accessible content');
    }
    
    // Process document based on type
    const processedInput = await processDocument(documentContent, mimeType);
    
    // Build Claude prompt
    const message = buildClaudePrompt(processedInput);
    
    // Call Claude API with the specified model
    console.log('Calling Claude API for extraction...');
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Using Claude Sonnet 4
      max_tokens: 1000,
      temperature: 0.1, // Low temperature for more consistent extraction
      messages: [message],
      system: `You are a travel document extraction engine. Output ONLY valid JSON. Never include text outside JSON.`
    });
    
    // Extract JSON from response
    const responseText = completion.content[0].type === 'text' 
      ? completion.content[0].text 
      : '';
    
    // Parse and validate JSON
    let extractedData: any;
    try {
      // Try to extract JSON from the response (in case there's any surrounding text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      throw new Error('Failed to parse extraction results');
    }
    
    // Validate with Zod schema
    const validationResult = TravelExtractSchema.safeParse(extractedData);
    if (!validationResult.success) {
      console.error('Validation errors:', validationResult.error);
      // Return partial results if some fields are valid
      const partialData = extractedData;
      return {
        success: true,
        data: partialData,
        partial: true,
        error: 'Some fields could not be validated'
      };
    }
    
    const validatedData = validationResult.data;
    
    // Fetch ALL active family members for traveler matching (household concept)
    // Don't filter by user_id since this is a family app
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('id, name')
      .eq('is_active', true)
      .eq('type', 'human')  // Exclude pets from travel matching
      .order('name');
    
    // Match travelers to family members
    const travelerMatchResult = await twoPassTravelerMatching(
      validatedData.travelers || [],
      familyMembers || []
    );
    
    // Enrich with timezone data
    const enrichedData = {
      ...validatedData,
      metadata: {
        timezone: getTimezoneForAirport(validatedData.departure_airport) || 'America/New_York',
        departure_timezone: getTimezoneForAirport(validatedData.departure_airport),
        arrival_timezone: getTimezoneForAirport(validatedData.arrival_airport)
      }
    };
    
    // Prepare response
    const response: TravelExtractResponse = {
      success: true,
      data: enrichedData,
      matched_travelers: travelerMatchResult.matched,
      unmatched_travelers: travelerMatchResult.unmatched,
      cached: false
    };
    
    // Cache the extraction
    await cacheExtraction(supabase, documentId, userId, response, SCHEMA_VERSION);
    
    return response;
    
  } catch (error: any) {
    console.error('Error extracting travel details:', error);
    return {
      success: false,
      error: error.message || 'Failed to extract travel details'
    };
  }
}

/**
 * Normalize airline names (only when unambiguous)
 */
export function normalizeAirlineName(airline: string): string {
  const airlineMap: Record<string, string> = {
    'AA': 'American Airlines',
    'DL': 'Delta Airlines',
    'UA': 'United Airlines',
    'WN': 'Southwest Airlines',
    'B6': 'JetBlue Airways',
    'AS': 'Alaska Airlines',
    'NK': 'Spirit Airlines',
    'F9': 'Frontier Airlines',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'AF': 'Air France',
    'EK': 'Emirates',
    'SQ': 'Singapore Airlines',
    'QF': 'Qantas',
    'AC': 'Air Canada'
  };
  
  // Only normalize if it's a clear airline code
  const upperAirline = airline.toUpperCase().trim();
  if (airlineMap[upperAirline]) {
    return airlineMap[upperAirline];
  }
  
  // Return as-is if not a clear match
  return airline;
}

/**
 * Normalize flight number
 */
export function normalizeFlightNumber(flightNumber: string): string {
  // Remove spaces and uppercase
  return flightNumber.replace(/\s+/g, '').toUpperCase().trim();
}
