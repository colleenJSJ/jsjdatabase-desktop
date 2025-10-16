import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { getBackblazeService } from '@/lib/backblaze/b2-service';
import { ActivityLogger } from '@/lib/services/activity-logger';
import { resolvePersonReferences } from '@/app/api/_helpers/person-resolver';
import { securityConfig } from '@/lib/config/security';
import { logger } from '@/lib/utils/logger';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) console.log('[Upload API] Request received');
  
  try {
    // Use the server-side Supabase client
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    console.log('[Upload API] Authentication successful for:', user.email);

    if (!isProd) logger.info('[Upload API] Parsing form data...');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const categoryRaw = formData.get('category') as string;
    const category = categoryRaw?.toLowerCase(); // Convert to lowercase for enum
    const sourcePage = formData.get('sourcePage') as string || formData.get('source_page') as string;
    const sourceId = formData.get('sourceId') as string || formData.get('source_id') as string;
    const description = formData.get('description') as string;
    const sourceTitle = formData.get('source_title') as string;
    const relatedPerson = formData.get('relatedPerson') as string;
    const relatedPeopleRaw = formData.get('relatedPeople') as string;
    const normalizedSourcePage = sourcePage ? sourcePage.toLowerCase() : undefined;

    if (!isProd) {
      console.log('[Upload API] Form data:', {
        fileName: file?.name,
        fileSize: file?.size,
        category,
        sourcePage,
        sourceId,
        hasDescription: !!description,
        sourceTitle,
        relatedPerson
      });
    }

    if (!file || !category) {
      console.error('[Upload API] Missing required fields');
      return jsonError('File and category are required', { status: 400 });
    }

    // Server-side upload validation
    try {
      const maxBytes = Math.max(1, securityConfig.MAX_UPLOAD_MB) * 1024 * 1024;
      if (file.size > maxBytes) {
        return jsonError(`File too large. Max ${securityConfig.MAX_UPLOAD_MB}MB`, { status: 413 });
      }
      const allowedTypes = new Set([
        'application/pdf',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'text/html'
      ]);
      const type = (file.type || '').toLowerCase();
      if (type && !allowedTypes.has(type)) {
        logger.warn('[Upload API] Rejected file type:', type);
        return jsonError('Unsupported file type', { status: 415 });
      }
    } catch (e) {
      logger.warn('[Upload API] Validation error:', e);
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Backblaze B2
    const backblazeService = getBackblazeService();
    const uploadResult = await backblazeService.uploadFile(
      file.name,
      buffer,
      file.type || 'application/octet-stream'
    );

    // Get additional fields from form data
    const title = formData.get('title') as string || file.name;
    const tagsRaw = formData.get('tags') as string;
    const expirationDate = formData.get('expiration_date') as string;
    const isStarred = formData.get('is_starred') === 'true';
    
    // Process tags - the frontend combines relatedTo IDs and custom tags
    let allTags: string[] = [];
    let relatedToIds: string[] = [];
    
    // If relatedPeople is provided (multiple selection), resolve to UUIDs
    if (relatedPeopleRaw) {
      try {
        const relatedPeopleInput = JSON.parse(relatedPeopleRaw);
        const resolved = await resolvePersonReferences(relatedPeopleInput);
        if (resolved) {
          relatedToIds = Array.isArray(resolved) ? resolved : [resolved];
        }
      } catch (e) {
        console.log('[Upload API] Failed to parse relatedPeople:', e);
      }
    } 
    // Fallback to single relatedPerson if no relatedPeople
    else if (relatedPerson) {
      const resolved = await resolvePersonReferences(relatedPerson);
      if (resolved && typeof resolved === 'string') {
        relatedToIds.push(resolved);
      }
    }
    
    if (tagsRaw) {
      try {
        const parsedTags = JSON.parse(tagsRaw);
        if (!isProd) console.log('[Upload API] Raw tags parsed');
        
        // Process tags - resolve any person references and separate from regular tags
        const otherTags: string[] = [];
        
        for (const tag of parsedTags) {
          // Check if this tag can be resolved to a person ID
          const personId = await resolvePersonReferences(tag);
          if (personId && typeof personId === 'string') {
            // It's a person reference, add to relatedToIds if not already there
            if (!relatedToIds.includes(personId)) {
              relatedToIds.push(personId);
            }
          } else if (tag === 'all') {
            // Special case: "all" means all family members
            const { data: allMembers } = await supabase
              .from('family_members')
              .select('id')
              .eq('is_active', true);
            
            if (allMembers) {
              const allIds = allMembers.map(m => m.id);
              relatedToIds = [...new Set([...relatedToIds, ...allIds])];
            }
          } else if (tag && tag !== 'all') {
            // It's a custom tag
            otherTags.push(tag);
          }
        }
        
        allTags = otherTags;
        
        if (!isProd) {
          console.log('[Upload API] Processed data:', {
            relatedToIdsCount: relatedToIds.length,
            otherTagsCount: allTags.length
          });
        }
        
      } catch {
        // If not JSON, split by comma
        allTags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
      }
    }
    
    // Use the same Supabase client to insert the document
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        title,
        file_name: uploadResult.fileName,
        file_url: uploadResult.fileUrl,
        file_size: file.size,
        file_type: file.type?.split('/').pop() || 'unknown',
        category,
        source_page: normalizedSourcePage || 'manual',
        source_id: sourceId || null,
        // source_title: sourceTitle || null, // Column might not exist - store in description instead
        description: description || null,
        uploaded_by: user.id,
        related_to: relatedToIds.length > 0 ? relatedToIds : null, // UUIDs of people doc relates to
        assigned_to: relatedToIds.length > 0 ? relatedToIds : null, // Keep for backwards compatibility
        tags: allTags.length > 0 ? allTags : null, // Only custom tags
        expiration_date: expirationDate || null,
        is_starred: isStarred,
        is_archived: false
      })
      .select()
      .single();

    if (error) {
      console.error('[Upload API] Database insert error:', error);
      return jsonError('Failed to save document', { status: 500, meta: { details: error.message } });
    }

    // Log the activity
    await ActivityLogger.logDocumentActivity(
      user.id,
      'created',
      document,
      {
        documentCategory: category,
        fileSize: file.size,
        fileType: file.type
      }
    );

    if (!isProd) logger.info('[Upload API] Upload successful:', document.id);
    return jsonSuccess({ document }, { legacy: { document } });
  } catch (error) {
    console.error('[Upload API] Unexpected error:', error instanceof Error ? error.message : error);
    return jsonError('Failed to upload document', {
      status: 500,
      meta: { details: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
}
