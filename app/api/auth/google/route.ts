import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Scopes for Google Calendar access + optional Gmail send for ICS fallback
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  // Gmail send is safe (send-only) and enables ICS invite fallback
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const loginHint = url.searchParams.get('login_hint') || undefined;
    // Generate the authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Gets refresh token
      scope: SCOPES,
      // Force account chooser + consent to avoid auto-selecting old test account
      prompt: 'select_account consent',
      include_granted_scopes: true,
      login_hint: loginHint
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
