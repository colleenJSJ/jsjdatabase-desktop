'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { Bell, Pin, Plus, Edit2, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  created_by_user?: {
    id: string;
    name: string;
  };
  is_pinned: boolean;
  expires_at: string;
  created_at: string;
}

export function WeeklyAnnouncements() {
  const { user } = useUser();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const isDev = process.env.NODE_ENV !== 'production';
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    
    // Set up 60-second refresh interval
    const interval = setInterval(() => {
      fetchAnnouncements();
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, []);

  const fetchAnnouncements = async () => {
    try {
      debugLog('[WeeklyAnnouncements] Fetching announcements...');
      const response = await fetch('/api/announcements');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[WeeklyAnnouncements] API error:', errorData);
        
        // Show specific error message
        toast({
          title: 'Error',
          description: errorData.error || `Failed to fetch announcements (${response.status})`,
          variant: 'destructive',
        });
        return;
      }
      
      const data = await response.json();
      debugLog('[WeeklyAnnouncements] Received data:', data);
      setAnnouncements(data.announcements || []);
    } catch (error) {
      console.error('[WeeklyAnnouncements] Network error:', error);
      toast({
        title: 'Error',
        description: 'Network error: Failed to connect to server',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    debugLog('[WeeklyAnnouncements] Deleting announcement:', id);
    
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.delete(`/api/announcements/${id}`);
      
      if (!response.success) {
        console.error('[WeeklyAnnouncements] Delete error:', response.error);
        
        toast({
          title: 'Error',
          description: response.error || 'Failed to delete announcement',
          variant: 'destructive',
        });
        return;
      }
      
      // Remove from local state
      setAnnouncements(announcements.filter(a => a.id !== id));
      toast({
        title: 'Success',
        description: 'Announcement deleted successfully',
      });
    } catch (error) {
      console.error('[WeeklyAnnouncements] Network error:', error);
      toast({
        title: 'Error',
        description: 'Network error: Failed to delete announcement',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a29' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-3 bg-gray-700 rounded w-full"></div>
          <div className="h-3 bg-gray-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl" style={{ backgroundColor: '#2a2a29' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-text-muted" />
            <h3 className="font-medium text-text-primary">Announcements</h3>
          </div>
          
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Create announcement"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        {announcements.length === 0 ? (
          <p className="text-text-muted text-sm">No announcements this week</p>
        ) : (
          <>
            {!collapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {announcements.map((announcement) => (
                  <div 
                    key={announcement.id} 
                    className="rounded-xl p-4 cursor-pointer transition-colors" 
                    style={{ 
                      backgroundColor: '#30302e', 
                      border: '1px solid #30302e' 
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.border = '1px solid #30302e';
                    }}
                    onClick={() => setSelectedAnnouncement(announcement)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                          {announcement.is_pinned && <Pin className="h-3 w-3 text-yellow-500" />}
                          {announcement.title}
                        </h4>
                        <p className="text-xs text-text-muted mt-2 whitespace-pre-wrap line-clamp-3">{announcement.message}</p>
                      </div>
                      
                      {user?.role === 'admin' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingAnnouncement(announcement)}
                            className="text-text-muted hover:text-text-primary transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(announcement.id)}
                            className="text-text-muted hover:text-urgent transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-end mt-4">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                {collapsed ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show announcements
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide announcements
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingAnnouncement) && (
        <AnnouncementModal
          announcement={editingAnnouncement}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          onSave={(savedAnnouncement) => {
            if (editingAnnouncement) {
              setAnnouncements(announcements.map(a => 
                a.id === savedAnnouncement.id ? savedAnnouncement : a
              ));
            } else {
              setAnnouncements([savedAnnouncement, ...announcements]);
            }
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          toast={toast}
        />
      )}
      
      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <AnnouncementDetailModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
          onEdit={() => {
            setEditingAnnouncement(selectedAnnouncement);
            setSelectedAnnouncement(null);
          }}
          onDelete={async () => {
            await handleDelete(selectedAnnouncement.id);
            setSelectedAnnouncement(null);
          }}
          isAdmin={user?.role === 'admin'}
        />
      )}
    </div>
  );
}

function AnnouncementDetailModal({ 
  announcement, 
  onClose, 
  onEdit,
  onDelete,
  isAdmin
}: { 
  announcement: Announcement; 
  onClose: () => void; 
  onEdit: () => void;
  onDelete: () => void;
  isAdmin?: boolean;
}) {
  const { preferences } = usePreferences();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div 
        className="bg-background-secondary rounded-lg max-w-lg w-full border border-gray-600/30" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              {announcement.is_pinned && <Pin className="h-5 w-5 text-yellow-500" />}
              {announcement.title}
            </h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-text-primary whitespace-pre-wrap">
              {announcement.message}
            </p>
            
            <div className="pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <div>
                  <p>Posted by: {announcement.created_by_user?.name || 'Unknown'}</p>
                  <p>Date: {(() => { const inst = toInstantFromNaive(announcement.created_at, preferences.timezone); return formatInstantInTimeZone(inst, preferences.timezone, { month: 'long', day: 'numeric', year: 'numeric' }); })()}</p>
                  {announcement.is_pinned && <p className="text-yellow-500 mt-1">📌 Pinned</p>}
                </div>
                
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={onEdit}
                      className="px-3 py-1.5 bg-button-edit hover:bg-button-edit/90 text-white text-xs font-medium rounded transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this announcement?')) {
                          onDelete();
                        }
                      }}
                      className="px-3 py-1.5 bg-button-delete hover:bg-button-delete/90 text-white text-xs font-medium rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnouncementModal({ 
  announcement, 
  onClose, 
  onSave,
  toast 
}: { 
  announcement: Announcement | null; 
  onClose: () => void; 
  onSave: (announcement: Announcement) => void;
  toast: any;
}) {
  const [title, setTitle] = useState(announcement?.title || '');
  const [message, setMessage] = useState(announcement?.message || '');
  const [isPinned, setIsPinned] = useState(announcement?.is_pinned || false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = announcement ? `/api/announcements/${announcement.id}` : '/api/announcements';
      const response = await fetch(url, {
        method: announcement ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          is_pinned: isPinned,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onSave(data.announcement);
        toast({
          title: 'Success',
          description: announcement ? 'Announcement updated successfully' : 'Announcement created successfully',
        });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Error',
          description: errorData.error || 'Failed to save announcement',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to save announcement',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-lg w-full border border-gray-600/30">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">
              {announcement ? 'Edit Announcement' : 'Create Announcement'}
            </h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                placeholder="Enter your announcement message. Use line breaks for bullet points:&#10;- First item&#10;- Second item"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary placeholder-text-muted/50 focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                />
                <span className="text-sm text-text-primary">Pin this announcement</span>
              </label>
              <p className="text-xs text-text-muted mt-1">
                Pinned announcements stay visible until unpinned
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading || !title || !message}
                className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-700/80 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-text-primary font-medium rounded-md transition-colors"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-md border border-gray-600/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
