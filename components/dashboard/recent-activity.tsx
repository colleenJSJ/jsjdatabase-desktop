'use client';

import { useState, useEffect } from 'react';
import { Shield, FileText, Calendar, Key, Users, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { PAGINATION } from '@/constants';

interface ActivityItem {
  id: string;
  user_name: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  resource_title?: string;
  details?: any;
  created_at: string;
}

const getActivityIcon = (action: string, resourceType?: string) => {
  if (action.includes('login')) return Shield;
  if (resourceType === 'document') return FileText;
  if (resourceType === 'calendar' || resourceType === 'event') return Calendar;
  if (resourceType === 'password') return Key;
  if (resourceType === 'user') return Users;
  return Activity;
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
};

export function RecentActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchRecentActivity();
  }, []);

  const fetchRecentActivity = async () => {
    try {
      // Fetch 5 activities total
      const response = await fetch(`/api/activity?limit=5`);
      const payload = await response.json();
      if (response.ok && payload.success) {
        const list = Array.isArray(payload.data?.activities)
          ? payload.data.activities
          : Array.isArray(payload.activities)
            ? payload.activities
            : [];
        setActivities(list);
      }
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-6">
        <div className="text-center py-4">
          <p className="text-text-muted">No recent activity</p>
        </div>
      </div>
    );
  }

  const displayedActivities = expanded ? activities : activities.slice(0, 3);
  const hasMoreActivities = activities.length > 3;

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-xl">
      <div className="p-6">
        <div className="space-y-4">
          {displayedActivities.map((activity, index) => {
            const Icon = getActivityIcon(activity.action, activity.resource_type);
            return (
              <div 
                key={activity.id} 
                className="flex items-center gap-4 pb-4 border-b border-gray-600/75 last:border-b-0 last:pb-0"
              >
                <div className="bg-gray-700/30 p-2 rounded-full">
                  <Icon className="h-4 w-4 text-text-muted" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{activity.user_name}</span> {activity.action}
                    {activity.resource_title && (
                      <span className="text-text-muted"> &ldquo;{activity.resource_title}&rdquo;</span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">{formatTimeAgo(activity.created_at)}</p>
                </div>
              </div>
            );
          })}
          
          {hasMoreActivities && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors mt-2"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  +{activities.length - 3} more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
