import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getGoogleTokens,
  upsertGoogleTokens,
  deleteGoogleTokens,
} from '@/lib/google/token-service';

export class GoogleAuthService {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Get OAuth client with valid tokens for a user
   */
  async getAuthenticatedClient(userId: string, options: { supabase?: SupabaseClient } = {}) {
    const { data, error } = await getGoogleTokens({
      supabase: options.supabase,
      userId: options.supabase ? undefined : userId,
    });

    if (error || !data?.tokens) {
      throw new Error('No OAuth tokens found for user');
    }

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: data.tokens.access_token as string,
      refresh_token: data.tokens.refresh_token as string,
      token_type: 'Bearer',
      expiry_date: data.tokens.expires_at ? new Date(data.tokens.expires_at as string).getTime() : undefined,
    });

    // Check if token is expired or will expire in next 5 minutes
    const expiryDate = data.tokens.expires_at ? new Date(data.tokens.expires_at as string) : null;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiryDate && expiryDate <= fiveMinutesFromNow) {
      // Refresh the token
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await upsertGoogleTokens({
          supabase: options.supabase,
          userId: options.supabase ? undefined : userId,
          payload: {
            access_token: credentials.access_token!,
            refresh_token: credentials.refresh_token || data.tokens.refresh_token,
            expires_at: new Date(credentials.expiry_date!).toISOString(),
            scope: credentials.scope ?? data.tokens.scope,
          },
        });

        this.oauth2Client.setCredentials(credentials);
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
        throw new Error('Failed to refresh OAuth token');
      }
    }

    return this.oauth2Client;
  }

  /**
   * Get calendar service for a user
   */
  async getCalendarService(userId: string, options: { supabase?: SupabaseClient } = {}) {
    const authClient = await this.getAuthenticatedClient(userId, options);
    return google.calendar({ version: 'v3', auth: authClient });
  }

  /**
   * Check if user has valid OAuth tokens
   */
  async hasValidTokens(userId: string, options: { supabase?: SupabaseClient } = {}): Promise<boolean> {
    const { data, error } = await getGoogleTokens({
      supabase: options.supabase,
      userId: options.supabase ? undefined : userId,
    });

    if (error || !data?.tokens?.expires_at) {
      return false;
    }

    const expiryDate = new Date(data.tokens.expires_at as string);
    const now = new Date();

    // Consider valid if not expired and has at least 5 minutes left
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiryDate > fiveMinutesFromNow;
  }

  /**
   * Revoke OAuth tokens for a user
   */
  async revokeTokens(userId: string, options: { supabase?: SupabaseClient } = {}): Promise<void> {
    try {
      const { data, error } = await getGoogleTokens({
        supabase: options.supabase,
        userId: options.supabase ? undefined : userId,
      });

      if (!error && data?.tokens?.access_token) {
        // Revoke token with Google
        await this.oauth2Client.revokeToken(data.tokens.access_token as string);
      }

      await deleteGoogleTokens({
        supabase: options.supabase,
        userId: options.supabase ? undefined : userId,
      });
    } catch (error) {
      console.error('Error revoking tokens:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const googleAuth = new GoogleAuthService();
