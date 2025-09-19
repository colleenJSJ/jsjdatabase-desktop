import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ comments: [] });

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const includeCompleted = searchParams.get('include_completed') === 'true';
    const mentions = searchParams.get('mentions');

    // Determine user's family member id for visibility filtering
    const fmId = await resolveCurrentUserToFamilyMember(user.id).catch(() => null);

    // Visible tasks query
    let taskQuery = supabase
      .from('tasks')
      .select('id, title, status, assigned_to, created_by');

    if (!includeCompleted) taskQuery = taskQuery.neq('status', 'completed');

    const parts = [`created_by.eq.${user.id}`];
    if (fmId) parts.push(`assigned_to.cs.{${fmId}}`);
    parts.push(`assigned_to.cs.{${user.id}}`);
    taskQuery = taskQuery.or(parts.join(','));

    const { data: tasks, error: tasksError } = await taskQuery;
    if (tasksError || !tasks || tasks.length === 0) return NextResponse.json({ comments: [] });
    const taskById = new Map<string, any>();
    const taskIds = tasks.map((t: any) => { taskById.set(t.id, t); return t.id; });

    // Pull most recent comments across those tasks
    let { data: rawComments } = await supabase
      .from('task_comments')
      .select('id, task_id, user_id, comment, created_at, is_deleted, parent_comment_id')
      .in('task_id', taskIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    let items = rawComments || [];
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
    if (items.length === 0) return NextResponse.json({ comments: [] });

    // Fetch user info for authors
    const userIds = Array.from(new Set(items.map((c: any) => c.user_id)));
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      usersMap = (users || []).reduce((acc: any, u: any) => { acc[u.id] = u; return acc; }, {});
    }

    // Build stream items with thread id
    const stream = items.map((c: any) => {
      const thread_id = c.parent_comment_id || c.id;
      const t = taskById.get(c.task_id);
      const u = usersMap[c.user_id];
      return {
        id: c.id,
        thread_id,
        task_id: c.task_id,
        task_title: t?.title || 'Task',
        user_name: u?.name,
        user_email: u?.email,
        comment: c.comment,
        created_at: c.created_at
      };
    });

    return NextResponse.json({ comments: stream });
  } catch (e) {
    return NextResponse.json({ comments: [] });
  }
}
