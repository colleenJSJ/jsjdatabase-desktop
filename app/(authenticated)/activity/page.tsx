'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow, format, isToday, isYesterday, startOfDay, endOfDay, subDays } from 'date-fns';
import { 
  Download, Search, Calendar, User, FileText, CheckCircle, 
  Trash2, Edit, Eye, Upload, Plus, Clock, Activity,
  Plane, Lock, Home, PawPrint, GraduationCap, MapPin, MessageCircle,
  Filter, X
} from 'lucide-react';

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type?: string;
  entity_id?: string | null;
  entity_name?: string | null;
  page?: string;
  details: Record<string, unknown>;
  created_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  // For unified handling
  type?: 'activity';
}

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  is_deleted: boolean;
  users: {
    id: string;
    name: string;
    email: string;
  };
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
  };
  // For unified handling
  type?: 'comment';
}

type CombinedActivity = (ActivityLog | TaskComment) & { type: 'activity' | 'comment' };

const timeFilters = [
  { id: 'today', name: 'Today' },
  { id: 'yesterday', name: 'Yesterday' },
  { id: 'week', name: 'Last 7 Days' },
  { id: 'month', name: 'Last 30 Days' },
  { id: 'all', name: 'All Time' }
];

const actionFilters = [
  { id: 'all', name: 'All Actions' },
  { id: 'created', name: 'Created' },
  { id: 'updated', name: 'Updated' },
  { id: 'deleted', name: 'Deleted' },
  { id: 'uploaded', name: 'Uploaded' },
  { id: 'completed', name: 'Completed' },
  { id: 'viewed', name: 'Viewed' },
  { id: 'commented', name: 'Commented' }
];

const resourceFilters = [
  { id: 'all', name: 'All Types' },
  { id: 'document', name: 'Documents' },
  { id: 'task', name: 'Tasks' },
  { id: 'comment', name: 'Comments' },
  { id: 'event', name: 'Calendar Events' },
  { id: 'travel', name: 'Travel' },
  { id: 'password', name: 'Passwords' },
  { id: 'household', name: 'Household' },
  { id: 'pet', name: 'Pets' },
  { id: 'j3-academic', name: 'J3 Academics' }
];

export default function ActivityPage() {
  const { user } = useUser();
  const router = useRouter();
  const [activities, setActivities] = useState<CombinedActivity[]>([]);
  const [comments, setComments] = useState<CombinedActivity[]>([]);
  const [combinedActivities, setCombinedActivities] = useState<CombinedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [stats, setStats] = useState({
    todayCount: 0,
    activeUsersToday: 0,
    mostActiveResource: '',
    weekCount: 0,
    commentsToday: 0
  });

  // Check if user is admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Fetch users for filter
  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch activities and comments
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAllData();
      const unsubscribe = subscribeToChanges();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user, timeFilter, userFilter, actionFilter, resourceFilter]);

  const fetchUsers = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('users')
      .select('id, name, email')
      .order('name');
    
    if (data) {
      setUsers(data);
    }
  };

  const getTimeRange = () => {
    const now = new Date();
    switch (timeFilter) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'week':
        return { start: subDays(now, 7), end: now };
      case 'month':
        return { start: subDays(now, 30), end: now };
      default:
        return null;
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchActivities(),
        fetchComments()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const isDev = process.env.NODE_ENV !== 'production';
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  };

  const fetchActivities = async () => {
    try {
      const supabase = createClient();
      debugLog('Fetching activities with filters:', {
        timeFilter,
        userFilter,
        actionFilter,
        resourceFilter
      });
      
      let query = supabase
        .from('activity_logs')
        .select(`
          *,
          user:user_id (
            id,
            name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      // Apply time filter
      const timeRange = getTimeRange();
      if (timeRange) {
        debugLog('Applying time range:', {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString()
        });
        query = query
          .gte('created_at', timeRange.start.toISOString())
          .lte('created_at', timeRange.end.toISOString());
      }

      // Apply other filters
      if (userFilter !== 'all' && actionFilter !== 'commented') {
        query = query.eq('user_id', userFilter);
      }
      if (actionFilter !== 'all' && actionFilter !== 'commented') {
        query = query.eq('action', actionFilter);
      }
      if (resourceFilter !== 'all' && resourceFilter !== 'comment') {
        query = query.eq('entity_type', resourceFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching activities:', error);
      } else {
      debugLog('Fetched activities:', data?.length || 0, 'records');
      if (data && data.length > 0) {
        debugLog('Sample activity:', data[0]);
        }
        const activitiesWithType: CombinedActivity[] = (data || []).map(a => ({ ...a, type: 'activity' as const }));
        setActivities(activitiesWithType);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  };

  const fetchComments = async () => {
    try {
      // Build query params
      const params = new URLSearchParams();
      if (timeFilter) params.set('timeFilter', timeFilter);
      if (userFilter !== 'all') params.set('userFilter', userFilter);
      
      const response = await fetch(`/api/comments?${params}`);
      if (response.ok) {
        const { comments: data } = await response.json();
        const commentsWithType: CombinedActivity[] = (data || []).map((c: TaskComment) => ({ ...c, type: 'comment' as const }));
        setComments(commentsWithType);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  };

  // Combine and sort activities and comments
  useEffect(() => {
    let combined: CombinedActivity[] = [];
    
    // Filter based on current filters
    if (actionFilter === 'commented') {
      // Only show comments
      combined = comments;
    } else if (resourceFilter === 'comment') {
      // Only show comments
      combined = comments;
    } else if (actionFilter === 'all' && resourceFilter === 'all') {
      // Show both
      combined = [...activities, ...comments];
    } else {
      // Show only activities (filtered)
      combined = activities;
    }
    
    // Sort by created_at
    combined.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    setCombinedActivities(combined);
    // Filter out actual activities and comments for stats
    const actualActivities = activities.filter(a => a.type === 'activity') as ActivityLog[];
    const actualComments = comments.filter(c => c.type === 'comment') as TaskComment[];
    calculateStats(actualActivities, actualComments);
  }, [activities, comments, actionFilter, resourceFilter]);

  const calculateStats = (activityData: ActivityLog[], commentData: TaskComment[]) => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = subDays(now, 7);

    const todayActivities = activityData.filter(a => 
      new Date(a.created_at) >= todayStart
    );

    const todayComments = commentData.filter(c => 
      new Date(c.created_at) >= todayStart
    );

    const weekActivities = activityData.filter(a => 
      new Date(a.created_at) >= weekStart
    );

    const weekComments = commentData.filter(c => 
      new Date(c.created_at) >= weekStart
    );

    // Count unique users today
    const uniqueUsersToday = new Set([
      ...todayActivities.map(a => a.user_id),
      ...todayComments.map(c => c.user_id)
    ]).size;

    // Find most active resource type
    const resourceCounts: Record<string, number> = {};
    todayActivities.forEach(a => {
      const type = a.entity_type || 'unknown';
      resourceCounts[type] = (resourceCounts[type] || 0) + 1;
    });
    resourceCounts['comment'] = todayComments.length;
    
    const mostActive = Object.entries(resourceCounts)
      .sort(([, a], [, b]) => b - a)[0];

    setStats({
      todayCount: todayActivities.length + todayComments.length,
      activeUsersToday: uniqueUsersToday,
      mostActiveResource: mostActive ? mostActive[0] : 'None',
      weekCount: weekActivities.length + weekComments.length,
      commentsToday: todayComments.length
    });
  };

  const subscribeToChanges = () => {
    const supabase = createClient();
    
    // Subscribe to activity logs
    const activitySub = supabase
      .channel('activity_changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        async (payload) => {
          // Fetch the new activity with user info
          const { data } = await supabase
            .from('activity_logs')
            .select(`
              *,
              user:user_id (
                id,
                name,
                email
              )
            `)
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            const activityWithType: CombinedActivity = { ...data as ActivityLog, type: 'activity' as const };
            setActivities(prev => [activityWithType, ...prev]);
          }
        }
      )
      .subscribe();

    // Subscribe to comments
    const commentSub = supabase
      .channel('comment_changes')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments' },
        async (payload) => {
          // Fetch the new comment with relations
          const { data } = await supabase
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
            .eq('id', payload.new.id)
            .single();
          
          if (data && !data.is_deleted) {
            const commentWithType: CombinedActivity = { ...data as unknown as TaskComment, type: 'comment' as const };
            setComments(prev => [commentWithType, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      activitySub.unsubscribe();
      commentSub.unsubscribe();
    };
  };

  const getActionColor = (action: string) => {
    // All actions use muted text color for consistency
    return 'text-text-muted';
  };

  const getActionIcon = (action: string) => {
    // Icons removed for cleaner display
    return null;
  };

  const getResourceIcon = (type: string) => {
    // Icons removed for cleaner display
    return null;
  };

  const getDetailedDescription = (item: CombinedActivity): string => {
    if (item.type === 'comment') {
      const comment = item as TaskComment;
      return `Commented on task "${comment.tasks.title}"`;
    }
    
    const activity = item as ActivityLog;
    const entityType = activity.entity_type || '';
    const entityName = activity.entity_name || '';
    
    if (entityName) {
      return `${activity.action} ${entityType} "${entityName}"`;
    }
    return `${activity.action} ${entityType}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };


  const formatActivityDate = (date: string) => {
    const activityDate = new Date(date);
    if (isToday(activityDate)) {
      return 'Today';
    } else if (isYesterday(activityDate)) {
      return 'Yesterday';
    } else {
      return format(activityDate, 'EEEE, MMMM d, yyyy');
    }
  };

  const groupActivitiesByDate = () => {
    const grouped: Record<string, CombinedActivity[]> = {};
    
    combinedActivities.forEach(activity => {
      const dateKey = format(new Date(activity.created_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(activity);
    });
    
    return grouped;
  };

  const filteredActivities = combinedActivities.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      
      if (item.type === 'comment') {
        const comment = item as TaskComment;
        return (
          comment.comment.toLowerCase().includes(query) ||
          comment.tasks.title.toLowerCase().includes(query) ||
          comment.users.name.toLowerCase().includes(query)
        );
      } else {
        const activity = item as ActivityLog;
        return (
          activity.entity_name?.toLowerCase().includes(query) ||
          activity.action.toLowerCase().includes(query) ||
          (activity.entity_type || '').toLowerCase().includes(query) ||
          activity.user?.name?.toLowerCase().includes(query)
        );
      }
    }
    return true;
  });

  const exportToCSV = () => {
    const headers = ['Date/Time', 'User', 'Action', 'Type', 'Title/Description', 'Details'];
    const rows = filteredActivities.map(item => {
      if (item.type === 'comment') {
        const comment = item as TaskComment;
        return [
          format(new Date(comment.created_at), 'yyyy-MM-dd HH:mm:ss'),
          comment.users.name,
          'commented',
          'comment',
          `Task: ${comment.tasks.title}`,
          comment.comment
        ];
      } else {
        const activity = item as ActivityLog;
        return [
          format(new Date(activity.created_at), 'yyyy-MM-dd HH:mm:ss'),
          activity.user?.name || 'Unknown',
          activity.action,
          activity.entity_type || '',
          activity.entity_name || '',
          JSON.stringify(activity.details || {})
        ];
      }
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  const groupedActivities = groupActivitiesByDate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">System Activity</h1>
        </div>
        
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Today&apos;s Actions</div>
          <div className="text-2xl font-bold text-text-primary">{stats.todayCount}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Active Users Today</div>
          <div className="text-2xl font-bold text-text-primary">{stats.activeUsersToday}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Comments Today</div>
          <div className="text-2xl font-bold text-text-primary">{stats.commentsToday}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Most Active Page</div>
          <div className="text-2xl font-bold text-text-primary capitalize">
            {stats.mostActiveResource.replace('_', ' ')}
          </div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Total This Week</div>
          <div className="text-2xl font-bold text-text-primary">{stats.weekCount}</div>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="space-y-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search actions, users, comments, pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                showFilters || (timeFilter !== 'today' || userFilter !== 'all' || actionFilter !== 'all' || resourceFilter !== 'all')
                  ? 'bg-gray-700 text-text-primary'
                  : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {(timeFilter !== 'today' || userFilter !== 'all' || actionFilter !== 'all' || resourceFilter !== 'all') && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  Active
                </span>
              )}
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-600/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Time Range
                  </label>
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {timeFilters.map(filter => (
                      <option key={filter.id} value={filter.id}>{filter.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    User
                  </label>
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="all">All Users</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Action Type
                  </label>
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {actionFilters.map(filter => (
                      <option key={filter.id} value={filter.id}>{filter.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Page/Resource
                  </label>
                  <select
                    value={resourceFilter}
                    onChange={(e) => setResourceFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {resourceFilters.map(filter => (
                      <option key={filter.id} value={filter.id}>{filter.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Clear Filters */}
              {(timeFilter !== 'today' || userFilter !== 'all' || actionFilter !== 'all' || resourceFilter !== 'all' || searchQuery) && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setTimeFilter('today');
                      setUserFilter('all');
                      setActionFilter('all');
                      setResourceFilter('all');
                      setSearchQuery('');
                    }}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-12">
            <div className="text-center">
              <p className="text-text-muted">
                {searchQuery || timeFilter !== 'all' || userFilter !== 'all' || actionFilter !== 'all' || resourceFilter !== 'all'
                  ? 'No activity matches your filters'
                  : 'No activity recorded yet'}
              </p>
            </div>
          </div>
        ) : (
          Object.entries(groupedActivities).map(([date, dateActivities]) => (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <h3 className="text-lg font-semibold text-text-primary">
                {formatActivityDate(dateActivities[0].created_at)}
              </h3>
              
              {/* Activities for this date */}
              <div className="space-y-4">
                {dateActivities.map(item => {
                  const isComment = item.type === 'comment';
                  const userData = isComment 
                    ? (item as TaskComment).users 
                    : (item as ActivityLog).user;
                  
                  const getSimpleAction = () => {
                    if (isComment) {
                      const comment = item as TaskComment;
                      return `Commented on task "${comment.tasks.title}"`;
                    }
                    const activity = item as ActivityLog;
                    const entityType = activity.entity_type || '';
                    const entityName = activity.entity_name || '';
                    
                    // Capitalize first letter of action
                    const action = activity.action.charAt(0).toUpperCase() + activity.action.slice(1);
                    
                    if (entityName) {
                      return `${action} ${entityType} "${entityName}"`;
                    }
                    return `${action} ${entityType}`;
                  };
                  
                  const getPageInfo = () => {
                    if (isComment) {
                      return 'Tasks page';
                    }
                    const activity = item as ActivityLog;
                    if (activity.page) {
                      // Capitalize first letter of page
                      const page = activity.page.charAt(0).toUpperCase() + activity.page.slice(1);
                      return `${page} page`;
                    }
                    const entityType = activity.entity_type || '';
                    const capitalizedType = entityType.charAt(0).toUpperCase() + entityType.slice(1);
                    return `${capitalizedType} page`;
                  };
                  
                  return (
                    <div key={item.id} className="bg-background-secondary border border-gray-600/30 rounded-lg p-5">
                      <div className="space-y-2">
                        {/* Line 1: Day, Time and user */}
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-text-muted">
                            {format(new Date(item.created_at), 'EEE, MMM d')} at {format(new Date(item.created_at), 'h:mm a')}
                          </span>
                          <span className="text-gray-500">•</span>
                          <span className="text-text-primary">
                            {userData?.name || 'Unknown User'}
                          </span>
                        </div>
                        
                        {/* Line 2: Action */}
                        <div className="text-text-primary text-sm">
                          {getSimpleAction()}
                        </div>
                        
                        {/* Line 3: Page */}
                        <div className="text-text-muted text-xs">
                          {getPageInfo()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
