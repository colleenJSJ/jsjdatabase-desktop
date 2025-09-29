import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  async getAuthenticatedClient(userId: string) {
    // Get stored tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (tokenError || !tokenData) {
      throw new Error('No OAuth tokens found for user');
    }

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: 'Bearer',
      expiry_date: new Date(tokenData.expires_at).getTime()
    });

    // Check if token is expired or will expire in next 5 minutes
    const expiryDate = new Date(tokenData.expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiryDate <= fiveMinutesFromNow) {
      // Refresh the token
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        const { error: updateError } = await supabase
          .from('user_google_tokens')
          .update({
            access_token: credentials.access_token!,
            expires_at: new Date(credentials.expiry_date!).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating refreshed token:', updateError);
        }

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
  async getCalendarService(userId: string) {
    const authClient = await this.getAuthenticatedClient(userId);
    return google.calendar({ version: 'v3', auth: authClient });
  }

  /**
   * Check if user has valid OAuth tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    const { data: tokenData, error } = await supabase
      .from('user_google_tokens')
      .select('expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !tokenData) {
      return false;
    }

    const expiryDate = new Date(tokenData.expires_at);
    const now = new Date();
    
    // Consider valid if not expired and has at least 5 minutes left
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiryDate > fiveMinutesFromNow;
  }

  /**
   * Revoke OAuth tokens for a user
   */
  async revokeTokens(userId: string): Promise<void> {
    try {
      // Get stored tokens
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_google_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .single();

      if (!tokenError && tokenData?.access_token) {
        // Revoke token with Google
        await this.oauth2Client.revokeToken(tokenData.access_token);
      }

      // Delete from database
      await supabase
        .from('user_google_tokens')
        .delete()
        .eq('user_id', userId);
    } catch (error) {
      console.error('Error revoking tokens:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const googleAuth = new GoogleAuthService();