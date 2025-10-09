import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { decrypt } from '@/lib/encryption';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const authResult = await requireUser(request, { enforceCsrf: false });
  if (authResult instanceof Response) {
    return authResult;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid request body', { status: 400 });
  }

  const ciphertext = typeof (payload as any)?.ciphertext === 'string' ? (payload as any).ciphertext : null;
  if (!ciphertext) {
    return jsonError('Ciphertext is required', { status: 400 });
  }

  try {
    const password = await decrypt(ciphertext);
    return jsonSuccess({ password });
  } catch (error) {
    console.error('[DecryptPortalPassword] Failed to decrypt', error);
    return jsonError('Failed to decrypt password', { status: 500 });
  }
}
