import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt, EncryptionServiceError } from '@/lib/encryption';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, text, payload } = body as {
      action?: 'encrypt' | 'decrypt';
      text?: string | null;
      payload?: string | null;
    };

    if (action === 'encrypt') {
      if (typeof text !== 'string') {
        return NextResponse.json({ error: 'text is required for encrypt action' }, { status: 400 });
      }
      const ciphertext = await encrypt(text);
      return NextResponse.json({ ciphertext });
    }

    if (action === 'decrypt') {
      if (typeof payload !== 'string') {
        return NextResponse.json({ error: 'payload is required for decrypt action' }, { status: 400 });
      }
      const plaintext = await decrypt(payload);
      return NextResponse.json({ plaintext });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    if (error instanceof EncryptionServiceError) {
      return NextResponse.json(
        { error: 'Encryption service failed', details: error.details },
        { status: error.status || 502 },
      );
    }

    console.error('[Encryption API] Unexpected error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
