import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

type ExpiresIn = SignOptions['expiresIn'];

const FIVE_MINUTES: ExpiresIn = 5 * 60; // seconds

export function createEdgeJwt(expiresIn: ExpiresIn = FIVE_MINUTES) {
  const rawSecret = process.env.SUPABASE_JWT_SECRET;
  if (!rawSecret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }

  // Handle secrets stored with literal \n sequences so they can be used as PEMs.
  const secret = rawSecret.includes('\\n') ? rawSecret.replace(/\\n/g, '\n') : rawSecret;
  const isPemKey = /-----BEGIN [A-Z ]+KEY-----/.test(secret);

  const payload = {
    aud: 'authenticated',
    role: 'service_role',
    iss: 'edge-client',
  } satisfies jwt.JwtPayload;

  const options: SignOptions = {
    algorithm: isPemKey ? 'ES256' : 'HS256',
    expiresIn,
  };

  if (isPemKey && process.env.SUPABASE_JWT_KEY_ID) {
    options.keyid = process.env.SUPABASE_JWT_KEY_ID;
  }

  return jwt.sign(payload, secret, options);
}

export function createEdgeHeaders(options?: {
  jwtExpiresIn?: ExpiresIn;
  includeApikey?: boolean;
  includeAuthorization?: boolean;
}) {
  const headers: Record<string, string> = {};

  if (options?.includeAuthorization !== false) {
    const token = createEdgeJwt(options?.jwtExpiresIn);
    headers.Authorization = `Bearer ${token}`;
  }

  if (options?.includeApikey !== false) {
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.EDGE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (apiKey) {
      headers.apikey = apiKey;
    }
  }

  return headers;
}
