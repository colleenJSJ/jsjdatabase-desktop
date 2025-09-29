'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckSquare, Square, RefreshCw, AlertCircle, Loader2, Link, Unlink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/contexts/user-context';

interface Calendar {
  id: string;
  google_calendar_id: string;
  name: string;
  background_color: string;
  foreground_color: string;
  is_primary: boolean;
  access_role: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Permission {
  user_id: string;
  user_email: string;
  user_name: string;
  user_role: string;
  calendars: {
    google_calendar_id: string;
    calendar_name: string;
    can_read: boolean;
    can_write: boolean;
    permission_id?: string;
  }[];
}

export function CalendarPermissions() {
  const { user: currentUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    email?: string;
    lastSync?: string;
  }>({ connected: false });
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSyncingEvents, setIsSyncingEvents] = useState(false);
  const [oauthDebug, setOauthDebug] = useState<{ clientId?: string|null; redirectUri?: string|null; appUrl?: string|null }|null>(null);

  useEffect(() => {
    fetchData();
    checkGoogleAuth();
    // Fetch OAuth debug info (clientId + redirectUri) to help resolve redirect mismatches
    fetch('/api/auth/google/debug').then(async (r) => {
      if (r.ok) setOauthDebug(await r.json());
    }).catch(() => {});
  }, []);

  const checkGoogleAuth = async () => {
    try {
      const response = await fetch('/api/auth/google/status');
      if (response.ok) {
        const data = await response.json();
        setHasGoogleAuth(data.hasValidTokens);
        setConnectionStatus({
          connected: data.connected || false,
          email: data.userEmail,
          lastSync: data.lastSync
        });
      }
    } catch (error) {
      console.error('Error checking Google auth status:', error);
      setConnectionStatus({ connected: false });
    }
  };

  const fetchData = async () => {
    try {
      const response = await fetch('/api/admin/calendar-permissions');
      if (response.ok) {
        const data = await response.json();
        setCalendars(data.calendars || []);
        setUsers(data.users || []);
        setPermissions(data.permissions || []);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const response = await fetch('/api/auth/google');
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error initiating Google auth:', error);
    }
  };

  const handleDisconnectAndReconnect = async () => {
    if (!confirm('This will disconnect the current Google account and let you connect a different one. Continue?')) return;
    try {
      // Disconnect silently
      const ApiClient = (await import('@/lib/api/api-client')).default;
      await ApiClient.delete('/api/auth/google/disconnect');
      // Start a fresh auth with account chooser; you can add a login_hint via prompt
      const res = await fetch('/api/auth/google');
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authUrl;
      } else {
        alert('Failed to start Google reconnect');
      }
    } catch (e) {
      console.error('Reconnect error:', e);
      alert('Failed to reconnect. Please try again.');
    }
  };

  const handleSyncCalendars = async () => {
    setSyncing(true);
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.post('/api/google/calendars/sync');
      
      if (response.success) {
        const data: any = response.data;
        console.log(`Successfully synced ${data.count} calendars`);
        
        // Refresh data instead of redirecting
        await fetchData();
        await checkGoogleAuth();
        alert(`Successfully synced ${data?.count ?? 0} calendars`);
      } else {
        console.error('Failed to sync calendars:', response.error);
        alert(`Failed to sync calendars: ${response.error}`);
      }
    } catch (error) {
      console.error('Error syncing calendars:', error);
      alert('Failed to sync calendars. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncEvents = async () => {
    setIsSyncingEvents(true);
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.post('/api/calendar-events/sync-all');
      
      if (response.success) {
        const data: any = response.data;
        console.log('Event sync results:', data);
        
        if (data?.totalEventsSynced > 0) {
          alert(`Successfully synced ${data.totalEventsSynced} events (${data.totalEventsCreated} new, ${data.totalEventsUpdated} updated)`);
        } else {
          alert('All events are up to date');
        }
        
        await checkGoogleAuth();
      } else {
        const errorMessage = response.error || 'Failed to sync events';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error syncing events:', error);
      alert('Failed to sync events. Please check your network connection and try again.');
    } finally {
      setIsSyncingEvents(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('This will disconnect your Google Calendar and remove all synced calendars and events. Are you sure?')) {
      return;
    }
    
    setIsDisconnecting(true);
    try {
      const response = await fetch('/api/auth/google/disconnect', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        alert('Successfully disconnected from Google Calendar');
        setHasGoogleAuth(false);
        setConnectionStatus({ connected: false });
        setCalendars([]);
        await fetchData();
      } else {
        const error = await response.json();
        alert(`Failed to disconnect: ${error.error}`);
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handlePermissionChange = async (
    userId: string,
    calendarId: string,
    field: 'can_read' | 'can_write',
    value: boolean
  ) => {
    const permissionKey = `${userId}-${calendarId}`;
    setSavingPermission(permissionKey);

    try {
      // Find current permission state
      const userPermission = permissions.find(p => p.user_id === userId);
      const calendarPermission = userPermission?.calendars.find(
        c => c.google_calendar_id === calendarId
      );

      // If toggling off read access, also turn off write access
      let updates = { [field]: value };
      if (field === 'can_read' && !value) {
        updates.can_write = false;
      }
      // If toggling on write access, also turn on read access
      if (field === 'can_write' && value) {
        updates.can_read = true;
      }

      const newPermission = {
        user_id: userId,
        google_calendar_id: calendarId,
        can_read: calendarPermission?.can_read || false,
        can_write: calendarPermission?.can_write || false,
        ...updates
      };

      const response = await fetch('/api/admin/calendar-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPermission)
      });

      if (response.ok) {
        // Update local state
        setPermissions(prevPermissions => 
          prevPermissions.map(p => {
            if (p.user_id === userId) {
              return {
                ...p,
                calendars: p.calendars.map(c => {
                  if (c.google_calendar_id === calendarId) {
                    return { ...c, ...updates };
                  }
                  return c;
                })
              };
            }
            return p;
          })
        );
      }
    } catch (error) {
      console.error('Error updating permission:', error);
    } finally {
      setSavingPermission(null);
    }
  };

  const handleToggleAllForUser = async (userId: string, enable: boolean) => {
    const userPermission = permissions.find(p => p.user_id === userId);
    if (!userPermission) return;

    // Update all calendars for this user
    for (const calendar of userPermission.calendars) {
      await handlePermissionChange(
        userId,
        calendar.google_calendar_id,
        'can_read',
        enable
      );
    }
  };

  const handleToggleAllForCalendar = async (calendarId: string, enable: boolean) => {
    // Update all users for this calendar
    for (const permission of permissions) {
      await handlePermissionChange(
        permission.user_id,
        calendarId,
        'can_read',
        enable
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Management Section */}
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-lg font-medium text-text-primary mb-4">Google Calendar Connection</h3>
        
        {!hasGoogleAuth ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-600/20 text-gray-400 rounded-md text-sm">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span>Not Connected</span>
              </div>
            </div>
            <p className="text-sm text-text-muted">
              Connect your Google account to sync calendars and events.
            </p>
            <Button
              onClick={handleGoogleAuth}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Link className="h-4 w-4 mr-2" />
              Connect Google Account
            </Button>
            {oauthDebug && (
              <div className="text-xs text-text-muted space-y-1">
                <div>Redirect URI (copy into Google Cloud):</div>
                <div className="p-2 bg-background-primary border border-gray-600/30 rounded text-[11px] break-all">
                  {oauthDebug.redirectUri}
                </div>
              </div>
            )}
            <div>
              <button
                onClick={handleDisconnectAndReconnect}
                className="text-xs text-text-muted underline hover:text-text-primary"
              >
                Disconnect and connect a different account
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-md text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>Connected</span>
                </div>
                {connectionStatus.email && (
                  <span className="text-sm text-text-muted">
                    {connectionStatus.email}
                  </span>
                )}
                {connectionStatus.lastSync && (
                  <div className="flex items-center gap-1 text-sm text-text-muted">
                    <Clock className="h-3 w-3" />
                    <span>Last sync: {new Date(connectionStatus.lastSync).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <Button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                variant="outline"
                className="text-red-400 hover:text-red-300 hover:bg-red-600/20"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />
                    Disconnect
                  </>
                )}
              </Button>
            </div>
            <div>
              <button
                onClick={handleDisconnectAndReconnect}
                className="text-xs text-text-muted underline hover:text-text-primary"
              >
                Disconnect and connect a different account
              </button>
            </div>

            {/* Sync Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSyncCalendars}
                disabled={syncing}
                className="bg-button-create hover:bg-button-create/90 text-white"
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing Calendars...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Calendars
                  </>
                )}
              </Button>
              <Button
                onClick={handleSyncEvents}
                disabled={isSyncingEvents}
                variant="outline"
              >
                {isSyncingEvents ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing Events...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Sync Events
                  </>
                )}
              </Button>
            </div>

            {/* Calendars List */}
            {calendars.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-600/30">
                <h4 className="text-sm font-medium text-text-primary mb-2">Synced Calendars ({calendars.length})</h4>
                <div className="space-y-1">
                  {calendars.map(cal => (
                    <div key={cal.id} className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-sm" 
                        style={{ backgroundColor: cal.background_color }}
                      />
                      <span className="text-text-muted">{cal.name}</span>
                      {cal.is_primary && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded">Primary</span>
                      )}
                      <span className="text-xs text-gray-500">({cal.access_role})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permissions Section - Only show if connected and has calendars */}
      {hasGoogleAuth && calendars.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-text-primary">Calendar Permissions</h3>
              <p className="text-sm text-text-muted mt-1">
                Control which users can access which Google calendars
              </p>
            </div>
          </div>

      <div className="bg-background-primary border border-gray-600/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600/30 bg-background-tertiary">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  User
                </th>
                {calendars.map(calendar => (
                  <th
                    key={calendar.google_calendar_id}
                    className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider min-w-[150px]"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: calendar.background_color }}
                      />
                      <span className="truncate max-w-[120px]" title={calendar.name}>
                        {calendar.name}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        onClick={() => handleToggleAllForCalendar(calendar.google_calendar_id, true)}
                        className="text-[10px] text-green-400 hover:text-green-300"
                      >
                        All
                      </button>
                      <span className="text-gray-600">|</span>
                      <button
                        onClick={() => handleToggleAllForCalendar(calendar.google_calendar_id, false)}
                        className="text-[10px] text-red-400 hover:text-red-300"
                      >
                        None
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {permissions.map(permission => (
                <tr key={permission.user_id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {permission.user_name}
                        </div>
                        <div className="text-xs text-text-muted">{permission.user_email}</div>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded mt-1 ${
                          permission.user_role === 'admin' 
                            ? 'bg-purple-500/20 text-purple-400' 
                            : permission.user_role === 'user'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {permission.user_role}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 ml-4">
                        <button
                          onClick={() => handleToggleAllForUser(permission.user_id, true)}
                          className="text-[10px] text-green-400 hover:text-green-300"
                        >
                          All
                        </button>
                        <button
                          onClick={() => handleToggleAllForUser(permission.user_id, false)}
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          None
                        </button>
                      </div>
                    </div>
                  </td>
                  {permission.calendars.map(calendar => {
                    const permissionKey = `${permission.user_id}-${calendar.google_calendar_id}`;
                    const isSaving = savingPermission === permissionKey;
                    
                    return (
                      <td
                        key={calendar.google_calendar_id}
                        className="px-4 py-4 text-center"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={calendar.can_read}
                              onChange={(e) => handlePermissionChange(
                                permission.user_id,
                                calendar.google_calendar_id,
                                'can_read',
                                e.target.checked
                              )}
                              disabled={isSaving}
                              className="rounded border-gray-600 bg-gray-700 text-gray-400"
                            />
                            <span className="text-xs text-text-muted">Read</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={calendar.can_write}
                              onChange={(e) => handlePermissionChange(
                                permission.user_id,
                                calendar.google_calendar_id,
                                'can_write',
                                e.target.checked
                              )}
                              disabled={isSaving || !calendar.can_read}
                              className="rounded border-gray-600 bg-gray-700 text-gray-400 disabled:opacity-50"
                            />
                            <span className="text-xs text-text-muted">Write</span>
                          </label>
                          {isSaving && (
                            <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-primary">
            <p className="font-medium mb-1">Permission Notes:</p>
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Read access allows users to view calendar events</li>
              <li>Write access allows users to create and edit events (requires read access)</li>
              <li>Admins always have full access to all calendars</li>
              <li>Changes are saved automatically</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
      )}
    </div>
  );
}
