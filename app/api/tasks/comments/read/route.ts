import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const threadId = body.thread_id as string | undefined;
    if (!threadId) return NextResponse.json({ success: false }, { status: 400 });

    // Get comments for the thread
    const { data: comments } = await supabase
      .from('task_comments')
      .select('id')
      .or(`id.eq.${threadId},parent_comment_id.eq.${threadId}`)
      .eq('is_deleted', false);

    const ids = (comments || []).map((c: any) => c.id);
    if (ids.length === 0) return NextResponse.json({ success: true });

    // Insert reads (ignore conflicts)
    const rows = ids.map((id: string) => ({ user_id: user.id, comment_id: id }));
    await supabase.from('task_comment_reads').upsert(rows, { onConflict: 'user_id,comment_id' });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

