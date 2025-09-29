import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ threads: [] });

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const includeCompleted = searchParams.get('include_completed') === 'true';
    const mentions = searchParams.get('mentions'); // 'me' or undefined

    // Determine user's family_member id for visibility filtering
    const fmId = await resolveCurrentUserToFamilyMember(user.id).catch(() => null);

    // Build visibility filter: tasks created by me OR assigned_to contains me (family_member id preferred)
    let taskQuery = supabase
      .from('tasks')
      .select('id, title, status, category, project_id, assigned_to, created_by');

    if (!includeCompleted) {
      taskQuery = taskQuery.neq('status', 'completed');
    }

    // Narrow to my visible tasks
    const filterParts: string[] = [`created_by.eq.${user.id}`];
    if (fmId) filterParts.push(`assigned_to.cs.{${fmId}}`);
    filterParts.push(`assigned_to.cs.{${user.id}}`);
    taskQuery = taskQuery.or(filterParts.join(','));

    const { data: tasks, error: tasksError } = await taskQuery;
    if (tasksError || !tasks || tasks.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    const taskById = new Map<string, any>();
    const taskIds = tasks.map((t: any) => { taskById.set(t.id, t); return t.id; });

    // Fetch recent comments across those tasks
    const { data: comments } = await supabase
      .from('task_comments')
      .select('id, task_id, user_id, comment, created_at, is_deleted, parent_comment_id')
      .in('task_id', taskIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(500);

    let items = comments || [];

    // Mentions filter: crude match on user's name or email when mentions=me
    if (mentions === 'me') {
      const tokens: string[] = [];
      if (user.email) tokens.push(user.email.toLowerCase());
      const nm = (user as any).user_metadata?.name || '';
      if (nm) tokens.push(nm.toLowerCase().split(' ')[0]);
      items = items.filter((c: any) => {
        const text = (c.comment || '').toLowerCase();
        return tokens.some(t => t && text.includes(t));
      });
    }
    if (items.length === 0) return NextResponse.json({ threads: [] });

    // Group by thread (parent_comment_id or self id)
    const threadsMap = new Map<string, any>();
    for (const c of items) {
      const threadId = c.parent_comment_id || c.id;
      const group = threadsMap.get(threadId) || { comments: [], last_comment_at: c.created_at, first: c, task_id: c.task_id };
      group.comments.push(c);
      if (!group.first || new Date(c.created_at) < new Date(group.first.created_at)) group.first = c;
      if (new Date(c.created_at) > new Date(group.last_comment_at)) group.last_comment_at = c.created_at;
      threadsMap.set(threadId, group);
    }

    // Build thread previews
    let previews: any[] = [];
    threadsMap.forEach((g, thread_id) => {
      const t = taskById.get(g.task_id);
      if (!t) return;
      previews.push({
        thread_id,
        task_id: g.task_id,
        task_title: t.title,
        task_status: t.status,
        first_comment: g.first?.comment || '',
        total_replies: Math.max(0, g.comments.length - 1),
        last_comment_at: g.last_comment_at,
      });
    });

    // Unread counts: fetch reads for these comments
    const allCommentIds = items.map((c: any) => c.id);
    let readSet = new Set<string>();
    if (allCommentIds.length > 0) {
      const { data: reads } = await supabase
        .from('task_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', allCommentIds);
      (reads || []).forEach((r: any) => readSet.add(r.comment_id));
    }

    previews = previews.map((p) => {
      const threadComments = (threadsMap.get(p.thread_id)?.comments || []) as any[];
      const unread = threadComments.reduce((acc, c) => acc + (readSet.has(c.id) ? 0 : 1), 0);
      return { ...p, unread_count: unread };
    });

    previews.sort((a, b) => new Date(b.last_comment_at).getTime() - new Date(a.last_comment_at).getTime());
    previews = previews.slice(0, limit);

    return NextResponse.json({ threads: previews });
  } catch (e) {
    return NextResponse.json({ threads: [] });
  }
}
