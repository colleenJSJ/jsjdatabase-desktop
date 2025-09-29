import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBackblazeService } from '@/lib/backblaze/b2-service';
import { v4 as uuidv4 } from 'uuid';
import { authenticateRequest } from '@/lib/utils/auth-middleware';
import { processRelatedToAsync } from '@/lib/constants/family-members';

export async function POST(request: NextRequest) {
  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return auth.response!;
    }
    
    const supabase = await createClient();
    const user = auth.user!;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const source_page = formData.get('source_page') as string;
    const source_id = formData.get('source_id') as string;
    const uploaded_by = formData.get('uploaded_by') as string || user.id;
    const description = formData.get('description') as string;
    const expiration_date = formData.get('expiration_date') as string;
    
    // Process tags - the frontend combines relatedTo IDs and custom tags
    const tagsRaw = formData.get('tags') as string;
    let tags: string[] = [];
    let assigned_to: string[] = [];
    
    if (tagsRaw) {
      try {
        const allTags = JSON.parse(tagsRaw);
        // Maps to family member IDs where possible
        const processed = await processRelatedToAsync(allTags);
        assigned_to = processed.assignedTo;
        tags = processed.otherTags;
      } catch {
        tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    if (!file || !title || !category || !source_page || !source_id) {
      return NextResponse.json(
        { error: 'File, title, category, source_page, and source_id are required' },
        { status: 400 }
      );
    }

    // Check if document already exists for this source
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id, file_url')
      .eq('source_page', source_page)
      .eq('source_id', source_id)
      .single();

    const backblazeService = getBackblazeService();
    
    if (existingDoc) {
      // Delete old file from Backblaze
      try {
        const oldFileName = existingDoc.file_url.split('/').pop();
        if (oldFileName) {
          await backblazeService.deleteFile(oldFileName);
        }
      } catch (error) {
        console.error('Failed to delete old file:', error);
      }
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = file.name.split('.').pop() || 'unknown';
    const fileName = `${source_page}_${source_id}_${uuidv4()}.${fileExtension}`;
    
    // Upload to Backblaze B2
    const uploadResult = await backblazeService.uploadFile(
      fileName,
      buffer,
      file.type || 'application/octet-stream'
    );

    if (existingDoc) {
      // Update existing document
      const { data: document, error } = await supabase
        .from('documents')
        .update({
          title,
          file_name: uploadResult.fileName,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
          file_type: file.type?.split('/').pop() || 'unknown',
          category,
          uploaded_by,
          assigned_to: assigned_to.length > 0 ? assigned_to : null,
          related_to: assigned_to.length > 0 ? assigned_to : null,
          tags,
          description,
          expiration_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id)
        .select()
        .single();

      if (error) {
        throw new Error('Failed to update document');
      }

      return NextResponse.json({ document, updated: true });
    } else {
      // Create new document
      const { data: document, error } = await supabase
        .from('documents')
        .insert({
          title,
          file_name: uploadResult.fileName,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
          file_type: file.type?.split('/').pop() || 'unknown',
          category,
          source_page,
          source_id,
          uploaded_by,
          assigned_to: assigned_to.length > 0 ? assigned_to : null,
          related_to: assigned_to.length > 0 ? assigned_to : null,
          tags,
          description,
          expiration_date,
          is_starred: false,
          is_archived: false
        })
        .select()
        .single();

      if (error) {
        throw new Error('Failed to create document');
      }

      return NextResponse.json({ document, updated: false });
    }
  } catch (error) {
    console.error('Auto-sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync document' },
      { status: 500 }
    );
  }
}
