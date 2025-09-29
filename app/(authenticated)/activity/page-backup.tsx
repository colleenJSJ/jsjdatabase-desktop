'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow, format, isToday, isYesterday, startOfDay, endOfDay, subDays } from 'date-fns';
import { 
  Download, Search, Calendar, User, FileText, CheckCircle, 
  Trash2, Edit, Eye, Upload, Plus, Clock, Activity,
  Plane, Lock, Home, PawPrint, GraduationCap, MapPin
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
  // Legacy fields for compatibility
  resource_type?: string;
  resource_id?: string | null;
  resource_title?: string | null;
}

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
  { id: 'viewed', name: 'Viewed' }
];

const resourceFilters = [
  { id: 'all', name: 'All Types' },
  { id: 'document', name: 'Documents' },
  { id: 'task', name: 'Tasks' },
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
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('today');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [stats, setStats] = useState({
    todayCount: 0,
    activeUsersToday: 0,
    mostActiveResource: '',
    weekCount: 0
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

  // Fetch activities
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchActivities();
      subscribeToActivities();
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

  const fetchActivities = async () => {
    try {
      const supabase = createClient();
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
        .limit(200);

      // Apply time filter
      const timeRange = getTimeRange();
      if (timeRange) {
        query = query
          .gte('created_at', timeRange.start.toISOString())
          .lte('created_at', timeRange.end.toISOString());
      }

      // Apply other filters
      if (userFilter !== 'all') {
        query = query.eq('user_id', userFilter);
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      if (resourceFilter !== 'all') {
        query = query.eq('resource_type', resourceFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching activities:', error);
      } else {
        setActivities(data || []);
        calculateStats(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: ActivityLog[]) => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = subDays(now, 7);

    const todayActivities = data.filter(a => 
      new Date(a.created_at) >= todayStart
    );

    const weekActivities = data.filter(a => 
      new Date(a.created_at) >= weekStart
    );

    // Count unique users today
    const uniqueUsersToday = new Set(todayActivities.map(a => a.user_id)).size;

    // Find most active resource type
    const resourceCounts: Record<string, number> = {};
    todayActivities.forEach(a => {
      const type = a.resource_type || 'unknown';
      resourceCounts[type] = (resourceCounts[type] || 0) + 1;
    });
    
    const mostActive = Object.entries(resourceCounts)
      .sort(([, a], [, b]) => b - a)[0];

    setStats({
      todayCount: todayActivities.length,
      activeUsersToday: uniqueUsersToday,
      mostActiveResource: mostActive ? mostActive[0] : 'None',
      weekCount: weekActivities.length
    });
  };

  const subscribeToActivities = () => {
    const supabase = createClient();
    const subscription = supabase
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
            setActivities(prev => [data, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created':
      case 'uploaded':
        return 'text-green-400';
      case 'updated':
      case 'edited':
        return 'text-blue-400';
      case 'deleted':
        return 'text-red-400';
      case 'completed':
        return 'text-purple-400';
      case 'viewed':
        return 'text-gray-400';
      default:
        return 'text-neutral-400';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created':
        return <Plus className="h-4 w-4" />;
      case 'uploaded':
        return <Upload className="h-4 w-4" />;
      case 'updated':
      case 'edited':
        return <Edit className="h-4 w-4" />;
      case 'deleted':
        return <Trash2 className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'viewed':
        return <Eye className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'task':
        return <CheckCircle className="h-4 w-4" />;
      case 'event':
        return <Calendar className="h-4 w-4" />;
      case 'travel':
      case 'trip':
        return <Plane className="h-4 w-4" />;
      case 'password':
        return <Lock className="h-4 w-4" />;
      case 'household':
      case 'inventory':
        return <Home className="h-4 w-4" />;
      case 'pet':
        return <PawPrint className="h-4 w-4" />;
      case 'j3-academic':
        return <GraduationCap className="h-4 w-4" />;
      case 'contact':
        return <User className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getDetailedDescription = (activity: ActivityLog): string => {
    const details = activity.details || {};
    const entityType = activity.entity_type || activity.resource_type || '';
    const entityName = activity.entity_name || activity.resource_title || '';
    
    let description = '';
    
    switch (activity.action) {
      case 'created':
        switch (entityType) {
          case 'task':
            description = `Created task "${details.taskTitle || entityName}"`;
            if (details.taskDueDate && typeof details.taskDueDate === 'string') {
              description += ` due ${new Date(details.taskDueDate).toLocaleDateString()}`;
            }
            if (Array.isArray(details.assignedTo) && details.assignedTo.length) {
              description += ` assigned to ${details.assignedTo.join(', ')}`;
            }
            break;
          case 'document':
            description = `Uploaded document "${details.documentTitle || entityName}"`;
            if (details.documentCategory) {
              description += ` in ${details.documentCategory}`;
            }
            if (details.fileSize && typeof details.fileSize === 'number') {
              description += ` (${formatFileSize(details.fileSize)})`;
            }
            break;
          case 'event':
            description = `Created event "${details.eventTitle || entityName}"`;
            if (details.eventDate && typeof details.eventDate === 'string') {
              description += ` on ${new Date(details.eventDate).toLocaleDateString()}`;
            }
            if (details.eventLocation) {
              description += ` at ${details.eventLocation}`;
            }
            break;
          case 'trip':
          case 'travel':
            description = `Created trip to ${details.tripDestination || entityName}`;
            if (details.tripDates && typeof details.tripDates === 'object' && 
                'start' in details.tripDates && 'end' in details.tripDates) {
              const dates = details.tripDates as { start: string; end: string };
              description += ` from ${new Date(dates.start).toLocaleDateString()} to ${new Date(dates.end).toLocaleDateString()}`;
            }
            break;
          case 'contact':
            description = `Added contact "${details.contactName || entityName}"`;
            if (details.contactCompany) {
              description += ` from ${details.contactCompany}`;
            }
            break;
          default:
            description = `Created ${entityType} "${entityName}"`;
        }
        break;
        
      case 'updated':
        description = `Updated ${entityType}`;
        if (entityName) {
          description = `Updated "${entityName}"`;
        }
        if (details.changes) {
          const changedFields = Object.keys(details.changes);
          if (changedFields.length > 0) {
            description += `: ${changedFields.join(', ')}`;
          }
        }
        break;
        
      case 'deleted':
        description = `Deleted ${entityType}`;
        if (entityName) {
          description = `Deleted "${entityName}"`;
        }
        if (details.itemCount && typeof details.itemCount === 'number' && details.itemCount > 1) {
          description = `Deleted ${details.itemCount} ${entityType}s`;
        }
        break;
        
      case 'completed':
        if (entityType === 'task') {
          description = `Completed task "${details.taskTitle || entityName}"`;
        } else {
          description = `Completed ${entityType} "${entityName}"`;
        }
        break;
        
      case 'viewed':
        description = `Viewed ${entityType}`;
        if (entityName) {
          description = `Viewed "${entityName}"`;
        }
        break;
        
      case 'exported':
        description = `Exported ${details.itemCount || 'all'} ${entityType}s`;
        if (details.filterCriteria) {
          const filters = Object.entries(details.filterCriteria)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}: ${value}`);
          if (filters.length > 0) {
            description += ` with filters: ${filters.join(', ')}`;
          }
        }
        break;
        
      case 'searched':
        description = `Searched ${entityType}`;
        if (details.searchQuery) {
          description += ` for "${details.searchQuery}"`;
        }
        break;
        
      default:
        description = `${activity.action} ${entityType}`;
        if (entityName) {
          description += ` "${entityName}"`;
        }
    }
    
    return description || `${activity.action} ${entityType}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
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
    const grouped: Record<string, ActivityLog[]> = {};
    
    activities.forEach(activity => {
      const dateKey = format(new Date(activity.created_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(activity);
    });
    
    return grouped;
  };

  const filteredActivities = activities.filter(activity => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        activity.resource_title?.toLowerCase().includes(query) ||
        activity.action.toLowerCase().includes(query) ||
        activity.resource_type?.toLowerCase().includes(query) ||
        activity.user?.name?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const exportToCSV = () => {
    const headers = ['Date/Time', 'User', 'Action', 'Resource Type', 'Resource Title', 'Details'];
    const rows = filteredActivities.map(activity => [
      format(new Date(activity.created_at), 'yyyy-MM-dd HH:mm:ss'),
      activity.user?.name || 'Unknown',
      activity.action,
      activity.resource_type,
      activity.resource_title || '',
      JSON.stringify(activity.details || {})
    ]);

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
          <h1 className="text-3xl font-bold text-white">System Activity</h1>
          <p className="text-neutral-400 mt-1">
            Complete audit log of all user actions
          </p>
        </div>
        
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md transition-colors border border-neutral-700"
        >
          <Download className="h-5 w-5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <div className="text-sm text-neutral-400">Today&apos;s Actions</div>
          <div className="text-2xl font-bold text-white">{stats.todayCount}</div>
        </div>
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <div className="text-sm text-neutral-400">Active Users Today</div>
          <div className="text-2xl font-bold text-white">{stats.activeUsersToday}</div>
        </div>
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <div className="text-sm text-neutral-400">Most Active Page</div>
          <div className="text-2xl font-bold text-white capitalize">
            {stats.mostActiveResource.replace('_', ' ')}
          </div>
        </div>
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
          <div className="text-sm text-neutral-400">Total This Week</div>
          <div className="text-2xl font-bold text-white">{stats.weekCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search actions, items, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap gap-4">
          {/* Time Filter */}
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-primary-500"
          >
            {timeFilters.map(filter => (
              <option key={filter.id} value={filter.id}>{filter.name}</option>
            ))}
          </select>

          {/* User Filter */}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Users</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-primary-500"
          >
            {actionFilters.map(filter => (
              <option key={filter.id} value={filter.id}>{filter.name}</option>
            ))}
          </select>

          {/* Resource Filter */}
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-primary-500"
          >
            {resourceFilters.map(filter => (
              <option key={filter.id} value={filter.id}>{filter.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-12">
            <div className="text-center">
              <Activity className="mx-auto h-12 w-12 text-neutral-600 mb-4" />
              <p className="text-neutral-400">
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
              <h3 className="text-lg font-semibold text-neutral-300">
                {formatActivityDate(dateActivities[0].created_at)} - {format(new Date(date), 'EEEE, MMMM d, yyyy')}
              </h3>
              
              {/* Activities for this date */}
              <div className="bg-neutral-800 border border-neutral-700 rounded-lg divide-y divide-neutral-700">
                {dateActivities.map(activity => (
                  <div key={activity.id} className="p-4 hover:bg-neutral-700/50 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Time */}
                      <div className="text-sm text-neutral-400 w-16">
                        {format(new Date(activity.created_at), 'h:mm a')}
                      </div>
                      
                      {/* User Avatar */}
                      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-medium text-white">
                        {activity.user ? getUserInitials(activity.user.name) : '?'}
                      </div>
                      
                      {/* Activity Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {activity.user?.name || 'Unknown User'}
                          </span>
                          <span className={`${getActionColor(activity.action)} flex items-center gap-1`}>
                            {getActionIcon(activity.action)}
                            <span>{getDetailedDescription(activity)}</span>
                          </span>
                          <span className="text-neutral-400">
                            {getResourceIcon(activity.entity_type || activity.resource_type || '')}
                          </span>
                        </div>
                        
                        {/* Additional Details */}
                        {activity.details && Object.keys(activity.details).length > 0 && (
                          <div className="mt-2 text-sm text-neutral-400">
                            {typeof activity.details.errorMessage === 'string' && (
                              <span className="text-red-400">Error: {activity.details.errorMessage}</span>
                            )}
                            {typeof activity.details.duration === 'number' && (
                              <span className="ml-4">Duration: {activity.details.duration}ms</span>
                            )}
                            {activity.page && (
                              <span className="ml-4">Page: {activity.page}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}