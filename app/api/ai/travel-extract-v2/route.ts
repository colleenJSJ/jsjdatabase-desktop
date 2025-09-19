import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractTravelDetails } from '@/lib/ai/travel-extractor';
import { processDocument, validateFile } from '@/lib/ai/document-processors';
import { generateContentHash } from '@/lib/utils/hash';
import { getBackblazeService } from '@/lib/backblaze/b2-service';
import { SCHEMA_VERSION } from '@/lib/ai/schemas';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { enhancedTravelerMatching } from '@/lib/ai/name-matcher';
import { processAirportValue } from '@/lib/ai/airport-resolver';
import { normalizeTravelerNames } from '@/lib/ai/name-normalizer';

// Use Node.js runtime for file processing
export const runtime = 'nodejs';

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Increased limit for development/testing - in production, keep at 10
const RATE_LIMIT_MAX_REQUESTS = process.env.NODE_ENV === 'development' ? 50 : 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

/**
 * Check cache for existing extraction
 */
async function checkCache(
  supabase: any,
  contentHash: string,
  userId: string,
  schemaVersion: string
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('extraction_cache_v2')
      .select('*')
      .eq('content_hash', contentHash)
      .eq('user_id', userId)
      .eq('schema_version', schemaVersion)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) return null;
    
    // Update extraction count
    await supabase
      .from('extraction_cache_v2')
      .update({ 
        extraction_count: data.extraction_count + 1 
      })
      .eq('id', data.id);
    
    return data.extracted_data;
  } catch (error) {
    console.error('Cache check error:', error);
    return null;
  }
}

/**
 * Store extraction in cache
 */
async function cacheExtraction(
  supabase: any,
  contentHash: string,
  userId: string,
  schemaVersion: string,
  extractedData: any,
  documentId?: string
): Promise<void> {
  try {
    await supabase
      .from('extraction_cache_v2')
      .upsert({
        content_hash: contentHash,
        user_id: userId,
        schema_version: schemaVersion,
        extracted_data: extractedData,
        document_id: documentId,
        extraction_count: 1,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }, {
        onConflict: 'content_hash,user_id,schema_version'
      });
  } catch (error) {
    console.error('Cache storage error:', error);
    // Non-critical, continue without caching
  }
}

/**
 * Generate a smart document title based on extracted travel data
 */
function generateSmartDocumentTitle(extractedData: any, originalFileName: string): string {
  try {
    // Determine transport type
    let transportType = 'Travel Doc';
    if (extractedData.data?.flight_number || extractedData.data?.airline) {
      transportType = 'Flight';
    } else if (extractedData.data?.transport_type) {
      // Format transport type (handle underscores and capitalize)
      const type = extractedData.data.transport_type;
      if (type === 'car_rental') {
        transportType = 'Car Rental';
      } else if (type === 'private_driver') {
        transportType = 'Private Driver';
      } else {
        // Capitalize first letter for other types
        transportType = type.charAt(0).toUpperCase() + type.slice(1);
      }
    }
    
    // Get traveler name(s)
    let travelerName = 'Unknown';
    if (extractedData.matched_travelers && extractedData.matched_travelers.length > 0) {
      if (extractedData.matched_travelers.length === 1) {
        // Single traveler - use their first name
        const fullName = extractedData.matched_travelers[0].name;
        travelerName = fullName.split(' ')[0]; // Get first name only
      } else {
        // Multiple travelers - list first names or say "Multiple"
        if (extractedData.matched_travelers.length <= 3) {
          travelerName = extractedData.matched_travelers
            .map((t: any) => t.name.split(' ')[0])
            .join(', ');
        } else {
          travelerName = 'Multiple';
        }
      }
    } else if (extractedData.data?.travelers && extractedData.data.travelers.length > 0) {
      // Fallback to raw traveler data if no matches
      travelerName = extractedData.data.travelers[0].split(' ')[0];
    }
    
    // Format date/time
    let dateTimeStr = '';
    const departureDate = extractedData.data?.departure_date;
    const departureTime = extractedData.data?.departure_time;
    const travelDate = extractedData.data?.travel_date;
    
    if (departureDate && departureTime) {
      // Combine date and time if both are available
      const dateTimeString = `${departureDate}T${departureTime}`;
      const date = new Date(dateTimeString);
      if (!isNaN(date.getTime())) {
        dateTimeStr = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      }
    } else if (departureDate) {
      // Use departure date only if no time
      const date = new Date(departureDate + 'T12:00:00'); // Add noon time to avoid timezone issues
      if (!isNaN(date.getTime())) {
        dateTimeStr = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        });
      }
    } else if (travelDate) {
      // Fallback to travel_date if no departure_date
      const date = new Date(travelDate + 'T12:00:00');
      if (!isNaN(date.getTime())) {
        dateTimeStr = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        });
      }
    }
    
    // Construct the title
    if (dateTimeStr) {
      return `${transportType} - ${travelerName} - ${dateTimeStr}`;
    } else {
      return `${transportType} - ${travelerName}`;
    }
    
  } catch (error) {
    console.error('Error generating smart document title:', error);
    // Fallback to original filename
    return originalFileName;
  }
}

/**
 * Store document after successful extraction
 */
async function storeDocumentAsync(
  supabase: any,
  file: File,
  userId: string,
  extractedData: any
): Promise<string | null> {
  try {
    const backblazeService = getBackblazeService();
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Backblaze
    const uploadResult = await backblazeService.uploadFile(
      file.name,
      buffer,
      file.type || 'application/octet-stream'
    );
    
    // Generate smart title for the document
    const smartTitle = generateSmartDocumentTitle(extractedData, file.name);
    
    // Store in database
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        title: smartTitle, // Use the smart title instead of file.name
        file_name: uploadResult.fileName, // Keep original filename here
        file_url: uploadResult.fileUrl,
        file_size: file.size,
        file_type: file.type?.split('/').pop() || 'unknown',
        category: 'travel',
        source_page: 'travel',
        description: `Extracted: ${extractedData.data?.airline || ''} ${extractedData.data?.flight_number || ''}`.trim(),
        uploaded_by: userId,
        metadata: {
          extraction: {
            extracted_at: new Date().toISOString(),
            schema_version: SCHEMA_VERSION,
            success: true
          }
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('Document storage error:', error);
      return null;
    }
    
    return document.id;
  } catch (error) {
    console.error('Document storage failed (non-critical):', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  console.log('[Extract V2] Request received');
  console.log('[Extract V2] Headers:', {
    contentType: request.headers.get('content-type'),
    cookie: request.headers.get('cookie')?.substring(0, 100) + '...',
    hasAuth: !!request.headers.get('cookie')
  });
  
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('[Extract V2] Auth check:', {
      hasSession: !!session,
      hasUser: !!user,
      sessionError: sessionError?.message,
      userError: userError?.message,
      userId: user?.id
    });
    
    if (!session || !user) {
      console.log('[Extract V2] Authentication failed - returning 401');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Authentication required',
          debug: {
            hasSession: !!session,
            hasUser: !!user,
            sessionError: sessionError?.message,
            userError: userError?.message
          }
        },
        { status: 401 }
      );
    }
    
    // Note: Rate limit check moved after cache check to not count cache hits
    
    // Check content type to determine request type
    const contentType = request.headers.get('content-type') || '';
    
    // Handle multipart form data (primary path - direct file upload)
    if (contentType.includes('multipart/form-data')) {
      console.log('[Extract V2] Processing multipart upload for user:', user.id);
      
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const storeDocument = formData.get('storeDocument') !== 'false';
      const tripId = formData.get('trip_id') as string;
      
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided' },
          { status: 400 }
        );
      }
      
      // Validate file
      const validation = validateFile(file.type, file.size);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: 400 }
        );
      }
      
      // Process file content
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentHash = generateContentHash(buffer);
      
      console.log('[Extract V2] Content hash:', contentHash.substring(0, 16) + '...');
      
      // Check cache first (before rate limiting)
      const cachedResult = await checkCache(supabase, contentHash, user.id, SCHEMA_VERSION);
      if (cachedResult) {
        console.log('[Extract V2] Cache hit! (not counting against rate limit)');
        
        // Process cached results
        if (cachedResult.data) {
          // Process airport codes
          if (cachedResult.data.departure_airport) {
            cachedResult.data.departure_airport = processAirportValue(cachedResult.data.departure_airport);
          }
          if (cachedResult.data.arrival_airport) {
            cachedResult.data.arrival_airport = processAirportValue(cachedResult.data.arrival_airport);
          }
          
          // Normalize traveler names
          if (cachedResult.data.travelers && Array.isArray(cachedResult.data.travelers)) {
            cachedResult.data.travelers = normalizeTravelerNames(cachedResult.data.travelers);
          }
        }
        
        return NextResponse.json({
          ...cachedResult,
          cached: true
        });
      }
      
      console.log('[Extract V2] Cache miss, checking rate limit before Claude call');
      
      // Only check rate limit if we're actually going to call Claude
      if (!checkRateLimit(user.id)) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Too many extraction requests. Please try again later. Note: Uploading the same document again will use the cache and not count against your limit.' 
          },
          { status: 429 }
        );
      }
      
      // Process document and extract
      const processedInput = await processDocument(buffer, file.type);
      
      // Call Claude directly with the processed content
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      });
      
      // Build message for Claude
      const systemPrompt = `You are a travel document extraction engine. 
Output ONLY valid JSON that matches the provided schema. Never include text outside JSON.
Extract: airline, flight_number, departure/arrival airports (IATA codes), dates (YYYY-MM-DD), times (HH:mm), travelers, confirmation_number.
CRITICAL: Only include fields you can extract from the document. Do NOT include fields with placeholder values like "MIA", "N/A", "Unknown", etc.
For outbound flights: Extract arrival_time and arrival_date (if different day) when present in the document.
For one-way trips, omit return_date and return_time entirely.

IMPORTANT NAME HANDLING RULES:
- If names are in ALL CAPS, convert to proper case (e.g., "CLAIRE" → "Claire", "JOHN SMITH" → "John Smith")
- For single first names without a last name, add the appropriate surname:
  - Johnson family members: John, Susan, Claire, Auggie, Blossom → add "Johnson"
  - Colleen → add "Russell" (not Johnson)
  - Kate/Katherine/Katie → add "McClaren" (not Johnson)
- For full names with middle names, keep as proper case (e.g., "CLAIRE OREON KINGMAN JOHNSON" → "Claire Oreon Kingman Johnson")
- If you see variations like "MR JOHN JOHNSON" or "MS SUSAN JOHNSON", normalize to "John Johnson" or "Susan Johnson"
- Special cases: "COLLEEN" → "Colleen Russell", "KATE" → "Kate McClaren"`;
      
      let messageContent: any[] = [{
        type: 'text',
        text: `Extract travel details from this document and return JSON with ONLY the fields you can find:
- airline (e.g., "Delta", "United")
- flight_number (e.g., "DL123")
- departure_airport (3-letter IATA code, e.g., "JFK", "LAX")
- arrival_airport (3-letter IATA code)
- departure_date (YYYY-MM-DD format)
- departure_time (HH:mm in 24-hour format)
- arrival_date (ONLY if arrival is on a different day, YYYY-MM-DD format)
- arrival_time (if present in document, HH:mm in 24-hour format)
- return_date (ONLY if round trip, YYYY-MM-DD format)
- return_time (ONLY if round trip, HH:mm format)
- confirmation_number (if present)
- travelers (array of names - see below for formatting)
- emails (array, if present)
- notes (any important notes, if relevant)

TRAVELER NAME FORMATTING:
- Convert ALL CAPS names to proper case
- If a name is just a first name, add "Johnson" as the last name
- Examples:
  * "CLAIRE" → "Claire Johnson"
  * "JOHN" → "John Johnson" 
  * "SUSAN" → "Susan Johnson"
  * "CLAIRE OREON KINGMAN JOHNSON" → "Claire Oreon Kingman Johnson"
  * "MR JOHN JOHNSON" → "John Johnson"
  * "AUGGIE" → "Auggie Johnson"
  * "BLOSSOM" → "Blossom Johnson"
  * "COLLEEN" → "Colleen Johnson"

Do NOT include any field if you cannot find its value. Leave it out entirely rather than using placeholders.`
      }];
      
      // Add content based on type
      if (processedInput.type === 'text') {
        messageContent.push({
          type: 'text',
          text: '\n\nDocument content:\n' + processedInput.content
        });
      } else if (processedInput.type === 'image') {
        messageContent.push(processedInput.content);
      }
      
      const completion = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: messageContent
        }],
        system: systemPrompt
      });
      
      // Parse response
      const responseText = completion.content[0].type === 'text' 
        ? completion.content[0].text 
        : '';
      
      let extractedData: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        extractedData = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Failed to parse Claude response:', responseText);
        return NextResponse.json({
          success: false,
          error: 'Failed to parse extraction results',
          partial: true
        });
      }
      
      // Store the original extracted data for caching (before any transformations)
      const originalExtractedData = { ...extractedData };
      
      // Normalize traveler names (handle ALL CAPS, add Johnson surname if needed)
      if (extractedData.travelers && Array.isArray(extractedData.travelers)) {
        console.log('[Extract V2] Original traveler names:', extractedData.travelers);
        extractedData.travelers = normalizeTravelerNames(extractedData.travelers);
        console.log('[Extract V2] Normalized traveler names:', extractedData.travelers);
      }
      
      // Get ALL active family members for traveler matching (household concept)
      // Don't filter by user_id since this is a family app
      const { data: familyMembers } = await supabase
        .from('family_members')
        .select('id, name')
        .eq('is_active', true)
        .eq('type', 'human')  // Exclude pets from travel matching
        .order('name');
      
      // Use enhanced traveler matching that handles middle names
      const travelerMatchResult = await enhancedTravelerMatching(
        extractedData.travelers || [],
        familyMembers || []
      );
      
      // Store original data in cache (before normalization, with original IATA codes)
      const cacheData = {
        success: true,
        data: originalExtractedData, // Store original data from Claude
        matched_travelers: travelerMatchResult.matched,
        unmatched_travelers: travelerMatchResult.unmatched,
        cached: false
      };
      
      // Cache the result with original IATA codes
      await cacheExtraction(
        supabase,
        contentHash,
        user.id,
        SCHEMA_VERSION,
        cacheData
      );
      
      // Process airport codes to full names for autocomplete in the response
      if (extractedData.departure_airport) {
        extractedData.departure_airport = processAirportValue(extractedData.departure_airport);
      }
      if (extractedData.arrival_airport) {
        extractedData.arrival_airport = processAirportValue(extractedData.arrival_airport);
      }
      
      // Prepare response with resolved airport names
      const result = {
        success: true,
        data: extractedData,
        matched_travelers: travelerMatchResult.matched,
        unmatched_travelers: travelerMatchResult.unmatched,
        cached: false
      };
      
      // Store document asynchronously if requested
      if (storeDocument) {
        storeDocumentAsync(supabase, file, user.id, result)
          .then(documentId => {
            if (documentId) {
              console.log('[Extract V2] Document stored:', documentId);
              // Optionally link to trip if tripId provided
              if (tripId) {
                supabase
                  .from('travel_documents')
                  .insert({
                    trip_id: tripId,
                    document_id: documentId
                  })
                  .then(() => console.log('[Extract V2] Linked to trip:', tripId));
              }
            }
          })
          .catch(error => console.error('[Extract V2] Storage error:', error));
      }
      
      return NextResponse.json(result);
      
    } 
    // Handle JSON body (existing path - document_id based)
    else if (contentType.includes('application/json')) {
      console.log('[Extract V2] Processing document_id request');
      
      const body = await request.json();
      const { document_id } = body;
      
      if (!document_id) {
        return NextResponse.json(
          { success: false, error: 'document_id is required' },
          { status: 400 }
        );
      }
      
      // Use existing extractTravelDetails function
      const result = await extractTravelDetails(document_id, user.id);
      return NextResponse.json(result);
    }
    
    // Unsupported content type
    return NextResponse.json(
      { success: false, error: 'Unsupported content type' },
      { status: 400 }
    );
    
  } catch (error: any) {
    console.error('Error in travel extraction v2:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'An error occurred while processing your request',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
