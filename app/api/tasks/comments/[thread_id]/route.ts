import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ thread_id: string }> }
) {
  const { thread_id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ comments: [] });

    // Fetch all comments in the thread (root id or replies)
    const { data: comments, error } = await supabase
      .from('task_comments')
      .select('id, task_id, user_id, comment, created_at, is_deleted, parent_comment_id')
      .or(`id.eq.${thread_id},parent_comment_id.eq.${thread_id}`)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ comments: [] });

    // Fetch users referenced
    const userIds = Array.from(new Set((comments || []).map((c: any) => c.user_id)));
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      usersMap = (users || []).reduce((acc: any, u: any) => { acc[u.id] = u; return acc; }, {});
    }

    const withUsers = (comments || []).map((c: any) => ({ ...c, users: usersMap[c.user_id] }));
    return NextResponse.json({ comments: withUsers });
  } catch (e) {
    return NextResponse.json({ comments: [] });
  }
}
