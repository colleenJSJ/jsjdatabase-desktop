import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

// Debug OAuth credentials
console.log('[OAuth Auth] Initializing OAuth2 client:');
console.log('[OAuth Auth] Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
console.log('[OAuth Auth] Has Client Secret:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('[OAuth Auth] Redirect URI:', process.env.GOOGLE_REDIRECT_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate OAuth URL with proper scopes
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to ensure we get refresh token
      state: user.id // Pass user ID in state for security
    });
    
    console.log('[OAuth Auth] Generated auth URL:', authUrl);

    // Return the auth URL
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication URL' },
      { status: 500 }
    );
  }
}