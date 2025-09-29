import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const effectiveRedirect = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`;
    return NextResponse.json({
      clientId: process.env.GOOGLE_CLIENT_ID || null,
      redirectUri: effectiveRedirect,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
    });
  } catch (e) {
    return NextResponse.json({ error: 'debug_failed' }, { status: 500 });
  }
}

