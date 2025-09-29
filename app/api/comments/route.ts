import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get auth user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const timeFilter = searchParams.get('timeFilter');
    const userFilter = searchParams.get('userFilter');
    const limit = parseInt(searchParams.get('limit') || '200');
    
    // Base query
    let query = supabase
      .from('task_comments')
      .select(`
        id,
        task_id,
        user_id,
        comment,
        created_at,
        is_deleted,
        users!inner (
          id,
          name,
          email
        ),
        tasks!inner (
          id,
          title,
          status,
          priority
        )
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply time filter
    if (timeFilter) {
      const now = new Date();
      let startDate: Date = now;
      
      switch (timeFilter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'yesterday':
          startDate = new Date(now.setDate(now.getDate() - 1));
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          query = query
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          query = query.gte('created_at', startDate.toISOString());
          break;
        case 'month':
          startDate = new Date(now.setDate(now.getDate() - 30));
          query = query.gte('created_at', startDate.toISOString());
          break;
      }
      
      if (timeFilter === 'today') {
        query = query.gte('created_at', startDate.toISOString());
      }
    }

    // Apply user filter
    if (userFilter && userFilter !== 'all') {
      query = query.eq('user_id', userFilter);
    }

    const { data: comments, error } = await query;

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    return NextResponse.json({ comments: comments || [] });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
