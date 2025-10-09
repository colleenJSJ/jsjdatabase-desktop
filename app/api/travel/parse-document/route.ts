import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { getBackblazeService } from '@/lib/backblaze/b2-service';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { getAnthropicService, AnthropicServiceError, type MessagesCreateResponse } from '@/lib/anthropic/anthropic-service';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

const anthropicService = getAnthropicService();

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;
    const saveToDocuments = formData.get('saveToDocuments') !== 'false'; // Default to true
    const tripId = formData.get('tripId') as string;
    const travelers = formData.get('travelers') as string; // JSON array of traveler IDs

    if (!file) {
      return jsonError('No file provided', { status: 400 });
    }

    const { user, supabase } = authResult;

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');

    // Determine media type
    let mediaType = 'image/jpeg';
    if (file.type === 'application/pdf') {
      mediaType = 'application/pdf';
    } else if (file.type.startsWith('image/')) {
      mediaType = file.type;
    }

    // Create prompt based on document type
    let prompt = '';
    if (documentType === 'flight') {
      prompt = `Analyze this travel document and extract flight information. Return a JSON object with the following fields:
- airline: airline name
- flight_number: flight number
- departure_airport: departure airport code or name
- arrival_airport: arrival airport code or name
- departure_time: departure date and time in ISO format
- arrival_time: arrival date and time in ISO format
- confirmation_number: booking confirmation number
- travelers: array of traveler names if visible

Only include fields where you can find the information. Return valid JSON only, no markdown or explanations.`;
    } else if (documentType === 'hotel') {
      prompt = `Analyze this hotel confirmation and extract the following information. Return a JSON object with:
- hotel_name: hotel name
- hotel_confirmation: confirmation number
- hotel_address: full address
- hotel_check_in: check-in date and time in ISO format
- hotel_check_out: check-out date and time in ISO format
- travelers: array of guest names if visible
- total_cost: total cost if visible (number only)
- currency: currency code (USD, EUR, etc.)

Only include fields where you can find the information. Return valid JSON only, no markdown or explanations.`;
    } else if (documentType === 'transport') {
      prompt = `Analyze this transportation document (train, ferry, car rental, etc.) and extract information. Return a JSON object with:
- type: transportation type (train, ferry, car_rental, private_driver, helicopter, other)
- provider: company name
- confirmation_number: booking reference
- departure_location: departure location/station
- arrival_location: arrival location/station
- departure_time: departure date and time in ISO format
- arrival_time: arrival date and time in ISO format (if available)
- vehicle_info: vehicle details (if car rental)
- travelers: array of traveler names if visible
- total_cost: total cost if visible (number only)
- currency: currency code

Only include fields where you can find the information. Return valid JSON only, no markdown or explanations.`;
    } else {
      // Generic travel document parsing for Smart Import
      prompt = `Analyze this travel confirmation document and extract comprehensive trip information. Look for:

1. Trip Overview:
   - destination: main destination city/location
   - start_date: trip start date in ISO format
   - end_date: trip end date in ISO format
   - purpose: business/leisure/family if mentioned
   - trip_type: vacation/business/medical/other

2. Travelers:
   - traveler_names: array of all traveler names found (look for passenger names, guest names, etc.)

3. Hotel Information:
   - hotel_name: hotel name
   - hotel_confirmation: confirmation number
   - hotel_address: full address
   - hotel_check_in: check-in date in ISO format
   - hotel_check_out: check-out date in ISO format

4. Flight Information (if present):
   - flights: array of flight objects with:
     - airline: airline name
     - flight_number: flight number
     - departure_airport: departure airport
     - arrival_airport: arrival airport
     - departure_time: departure time in ISO format
     - arrival_time: arrival time in ISO format
     - confirmation_number: booking reference

5. Other Transportation:
   - transportation: array of other transport with type, provider, times, etc.

6. Costs:
   - total_cost: total trip cost (number only)
   - currency: currency code (USD, EUR, etc.)

7. Additional:
   - notes: any special instructions or important details

Extract dates carefully - if you see "March 15-22, 2024", set start_date as 2024-03-15 and end_date as 2024-03-22.
For traveler names, look for variations like "Mr. John Johnson", "Susan Johnson", "Auggie Johnson", "Blossom Johnson", "Claire Johnson".
Return a clean JSON object with only the fields you can extract. No markdown or explanations.`;
    }

    // Call Claude API
    let messageResponse: MessagesCreateResponse;
    try {
      messageResponse = await anthropicService.createMessage({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as any,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });
    } catch (error) {
      if (error instanceof AnthropicServiceError) {
        console.error('[Travel Parse] Anthropic service error', error.details);
        return jsonError('Failed to extract travel details', {
          status: error.status || 502,
          meta: { details: error.details },
        });
      }
      throw error;
    }

    // Parse the response
    const responseText = messageResponse.content?.[0]?.type === 'text'
      ? (messageResponse.content?.[0]?.text ?? '')
      : '';
    
    let extractedData;
    try {
      extractedData = JSON.parse(responseText);
    } catch (parseError) {
      // If JSON parsing fails, return the raw text
      return jsonError('Failed to parse extracted data', {
        status: 500,
        meta: { rawText: responseText },
      });
    }

    // Save document to documents table if requested
    let savedDocument = null;
    if (saveToDocuments) {
      try {
        // Upload to Backblaze B2
        const backblazeService = getBackblazeService();
        const uploadResult = await backblazeService.uploadFile(
          file.name,
          buffer,
          file.type || 'application/octet-stream'
        );

        // Determine title based on extracted data
        const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '');
        let title = stripExt(file.name);
        if (documentType === 'flight' && extractedData) {
          if (extractedData.airline && extractedData.flight_number) {
            title = `Flight ${extractedData.airline} ${extractedData.flight_number}`;
          } else if (extractedData.departure_airport && extractedData.arrival_airport) {
            title = `Flight ${extractedData.departure_airport} to ${extractedData.arrival_airport}`;
          }
          if (extractedData.departure_date || extractedData.departure_time) {
            const dateStr = extractedData.departure_date || 
                          (extractedData.departure_time ? extractedData.departure_time.split('T')[0] : '');
            if (dateStr) {
              title += ` - ${dateStr}`;
            }
          }
        } else if (documentType === 'hotel' && extractedData) {
          if (extractedData.hotel_name) {
            title = `Hotel: ${extractedData.hotel_name}`;
            if (extractedData.hotel_check_in) {
              title += ` - ${extractedData.hotel_check_in.split('T')[0]}`;
            }
          }
        } else if (documentType === 'transport' && extractedData) {
          const provider = extractedData.provider || extractedData.type || 'Transport';
          title = `Transport: ${provider}`;
          const dep = extractedData.departure_time || extractedData.departure_date;
          if (dep) title += ` - ${String(dep).split('T')[0]}`;
        } else if (extractedData) {
          // Generic travel doc: build an informative title if possible
          if (extractedData.destination) {
            title = `Travel: ${extractedData.destination}`;
            const start = extractedData.start_date || (extractedData.hotel_check_in);
            if (start) title += ` - ${String(start).split('T')[0]}`;
          } else if (Array.isArray(extractedData.flights) && extractedData.flights.length > 0) {
            const f0 = extractedData.flights[0];
            if (f0?.airline && f0?.flight_number) {
              title = `Flight ${f0.airline} ${f0.flight_number}`;
            } else if (f0?.departure_airport && f0?.arrival_airport) {
              title = `Flight ${f0.departure_airport} to ${f0.arrival_airport}`;
            }
            const dep = f0?.departure_time || f0?.departure_date;
            if (dep) title += ` - ${String(dep).split('T')[0]}`;
          } else if (extractedData.hotel_name) {
            title = `Hotel: ${extractedData.hotel_name}`;
            const ci = extractedData.hotel_check_in;
            if (ci) title += ` - ${String(ci).split('T')[0]}`;
          }
        }

        // Prepare related_to field (travelers)
        let relatedToIds = [];
        if (travelers) {
          try {
            relatedToIds = JSON.parse(travelers);
          } catch (e) {
            console.log('[Travel Parse] Failed to parse travelers:', e);
          }
        }

        // Create description from extracted data
        const descriptionParts = [];
        if (extractedData.confirmation_number) {
          descriptionParts.push(`Confirmation: ${extractedData.confirmation_number}`);
        }
        if (extractedData.airline) {
          descriptionParts.push(`Airline: ${extractedData.airline}`);
        }
        if (extractedData.flight_number) {
          descriptionParts.push(`Flight: ${extractedData.flight_number}`);
        }
        if (extractedData.hotel_name) {
          descriptionParts.push(`Hotel: ${extractedData.hotel_name}`);
        }
        const description = descriptionParts.join(' | ') || null;

        // Save to documents table
        const { data: document, error } = await supabase
          .from('documents')
          .insert({
            title,
            file_name: uploadResult.fileName,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
            file_type: file.type?.split('/').pop() || 'unknown',
            category: 'travel',
            source_page: 'travel',
            source_id: tripId || null,
            description,
            uploaded_by: user.id,
            related_to: relatedToIds.length > 0 ? relatedToIds : null,
            assigned_to: relatedToIds.length > 0 ? relatedToIds : null,
            tags: documentType ? [documentType] : null,
            is_archived: false
          })
          .select()
          .single();

        if (error) {
          console.error('[Travel Parse] Failed to save document:', error);
        } else {
          savedDocument = document;
          
          // Log the activity
          await ActivityLogger.logDocumentActivity(
            user.id,
            'created',
            document,
            {
              documentCategory: 'travel',
              fileSize: file.size,
              fileType: file.type,
              // extractedData
            }
          );
        }
      } catch (saveError) {
        console.error('[Travel Parse] Error saving document:', saveError);
        // Don't fail the entire request if document save fails
      }
    }

    return jsonSuccess(
      { data: extractedData, document: savedDocument },
      {
        legacy: {
          success: true,
          data: extractedData,
          document: savedDocument,
        },
      }
    );
  } catch (error) {
    console.error('Document parsing error:', error);
    return jsonError('Failed to parse document', { status: 500 });
  }
}
