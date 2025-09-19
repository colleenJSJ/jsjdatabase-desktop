import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractTravelDetails } from '@/lib/ai/travel-extractor';
import { validateFile } from '@/lib/ai/document-processors';
import { z } from 'zod';

// Use Node.js runtime for PDF and image processing
export const runtime = 'nodejs';

// Request schema
const RequestSchema = z.object({
  document_id: z.string().uuid('Invalid document ID format')
});

// Simple in-memory rate limiting (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize rate limit
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

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request: ' + (validationResult.error as any).issues?.[0]?.message 
        },
        { status: 400 }
      );
    }
    
    const { document_id } = validationResult.data;
    
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Too many extraction requests. Please try again later.' 
        },
        { status: 429 }
      );
    }
    
    // Verify document ownership
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, file_type, file_size, file_url, file_name')
      .eq('id', document_id)
      .single();
    
    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }
    
    if (document.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }
    
    // Determine MIME from stored type or filename
    const inferMime = (t?: string | null, name?: string | null) => {
      const type = (t || '').toLowerCase();
      if (type.includes('/')) return type; // already a MIME type
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
    const mimeType = inferMime(document.file_type, document.file_name);

    // Validate file type and size (using inferred MIME)
    const fileValidation = validateFile(mimeType, document.file_size || 0);
    
    if (!fileValidation.valid) {
      return NextResponse.json(
        { success: false, error: fileValidation.error },
        { status: 400 }
      );
    }
    
    // Extract travel details
    console.log(`Extracting travel details for document ${document_id} (user: ${user.id})`);
    const extractionResult = await extractTravelDetails(document_id, user.id);
    
    // Log extraction attempt for monitoring
    try {
      await supabase
        .from('activity_logs')
        .insert({
          user_id: user.id,
          action: 'travel_extraction',
          details: {
            document_id,
            success: extractionResult.success,
            cached: extractionResult.cached,
            partial: extractionResult.partial
          }
        });
    } catch (logError) {
      console.error('Failed to log extraction activity:', logError);
    }
    
    // Return extraction results
    if (!extractionResult.success) {
      // Even if extraction failed, return 200 with error in response
      // This allows frontend to handle gracefully
      return NextResponse.json(extractionResult, { status: 200 });
    }
    
    return NextResponse.json(extractionResult, { status: 200 });
    
  } catch (error: any) {
    console.error('Error in travel extraction endpoint:', error);
    
    // Check for specific error types
    if (error.message?.includes('rate limit')) {
      return NextResponse.json(
        { success: false, error: 'API rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    if (error.message?.includes('timeout')) {
      return NextResponse.json(
        { success: false, error: 'Request timed out. Please try with a smaller file.' },
        { status: 408 }
      );
    }
    
    // Generic error response
    return NextResponse.json(
      { 
        success: false, 
        error: 'An error occurred while processing your request. Please try again.' 
      },
      { status: 500 }
    );
  }
}

// OPTIONS request for CORS (if needed)
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
