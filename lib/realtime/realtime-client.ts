/**
 * Supabase Realtime Client
 * Manages WebSocket connections for real-time updates
 */

import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeSubscription {
  channel: RealtimeChannel;
  unsubscribe: () => void;
}

export interface RealtimeConfig {
  event?: RealtimeEvent | RealtimeEvent[] | '*';
  schema?: string;
  table?: string;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onChange?: (payload: RealtimePostgresChangesPayload<any>) => void;
  onError?: (error: any) => void;
}

class RealtimeClient {
  private supabase = createClient();
  private channels: Map<string, RealtimeChannel> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private presenceStates: Map<string, any> = new Map();

  /**
   * Subscribe to database changes
   */
  subscribeToTable(config: RealtimeConfig): RealtimeSubscription {
    const {
      event = '*',
      schema = 'public',
      table,
      filter,
      onInsert,
      onUpdate,
      onDelete,
      onChange,
      onError
    } = config;

    if (!table) {
      throw new Error('Table name is required for realtime subscription');
    }

    // Create unique channel name
    const channelName = `${schema}:${table}:${filter || 'all'}:${Date.now()}`;
    
    // Create channel
    const channel = this.supabase.channel(channelName);
    
    // Configure postgres changes
    const events = Array.isArray(event) ? event : [event];
    
    events.forEach(evt => {
      const postgresConfig: any = {
        event: evt,
        schema,
        table,
      };
      
      if (filter) {
        postgresConfig.filter = filter;
      }
      
      channel.on(
        'postgres_changes',
        postgresConfig,
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('[Realtime] Change received:', payload);
          
          // Call specific handlers
          switch (payload.eventType) {
            case 'INSERT':
              onInsert?.(payload.new);
              break;
            case 'UPDATE':
              onUpdate?.(payload.new);
              break;
            case 'DELETE':
              onDelete?.(payload.old);
              break;
          }
          
          // Call general handler
          onChange?.(payload);
        }
      );
    });
    
    // Handle connection events
    channel
      .on('system', { event: 'error' }, (error) => {
        console.error('[Realtime] Channel error:', error);
        onError?.(error);
        this.handleReconnect(channelName, config);
      })
      .on('system', { event: 'close' }, () => {
        console.log('[Realtime] Channel closed:', channelName);
      });
    
    // Subscribe to channel
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Subscribed to:', channelName);
      } else if (status === 'CLOSED') {
        console.log('[Realtime] Channel closed:', channelName);
        this.handleReconnect(channelName, config);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Realtime] Channel error:', channelName);
        onError?.('Channel subscription error');
      }
    });
    
    // Store channel reference
    this.channels.set(channelName, channel);
    
    // Return subscription object
    return {
      channel,
      unsubscribe: () => this.unsubscribe(channelName)
    };
  }

  /**
   * Subscribe to presence (who's online)
   */
  subscribeToPresence(
    roomName: string,
    userData: any,
    onSync: (state: any) => void,
    onJoin?: (key: string, current: any, newPresence: any) => void,
    onLeave?: (key: string, current: any, leftPresence: any) => void
  ): RealtimeSubscription {
    const channelName = `presence:${roomName}`;
    
    const channel = this.supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        this.presenceStates.set(roomName, state);
        onSync(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        onJoin?.(key, this.presenceStates.get(roomName), newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        onLeave?.(key, this.presenceStates.get(roomName), leftPresences);
      });
    
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(userData);
      }
    });
    
    this.channels.set(channelName, channel);
    
    return {
      channel,
      unsubscribe: () => this.unsubscribe(channelName)
    };
  }

  /**
   * Subscribe to broadcast events
   */
  subscribeToBroadcast(
    channelName: string,
    event: string,
    onMessage: (payload: any) => void
  ): RealtimeSubscription {
    const channel = this.supabase.channel(channelName);
    
    channel
      .on('broadcast', { event }, (payload) => {
        console.log('[Realtime] Broadcast received:', event, payload);
        onMessage(payload.payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to broadcast:', channelName);
        }
      });
    
    this.channels.set(channelName, channel);
    
    return {
      channel,
      unsubscribe: () => this.unsubscribe(channelName)
    };
  }

  /**
   * Send broadcast message
   */
  async broadcast(
    channelName: string,
    event: string,
    payload: any
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    
    if (!channel) {
      console.error('[Realtime] Channel not found:', channelName);
      return;
    }
    
    await channel.send({
      type: 'broadcast',
      event,
      payload
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(channelName: string, config: RealtimeConfig): void {
    // Clear existing timeout
    const existingTimeout = this.reconnectTimeouts.get(channelName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set reconnect timeout
    const timeout = setTimeout(() => {
      console.log('[Realtime] Attempting to reconnect:', channelName);
      this.unsubscribe(channelName);
      this.subscribeToTable(config);
    }, 5000); // 5 second delay
    
    this.reconnectTimeouts.set(channelName, timeout);
  }

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
    
    // Clear reconnect timeout
    const timeout = this.reconnectTimeouts.get(channelName);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(channelName);
    }
    
    // Clear presence state
    const roomName = channelName.replace('presence:', '');
    this.presenceStates.delete(roomName);
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll(): void {
    this.channels.forEach((channel, name) => {
      this.unsubscribe(name);
    });
  }

  /**
   * Get all active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Check if subscribed to a channel
   */
  isSubscribed(channelName: string): boolean {
    return this.channels.has(channelName);
  }
}

// Export singleton instance
export const realtimeClient = new RealtimeClient();

// Export for testing
export default RealtimeClient;