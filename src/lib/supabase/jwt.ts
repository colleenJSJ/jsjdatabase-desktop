import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

type ExpiresIn = SignOptions['expiresIn'];

const FIVE_MINUTES: ExpiresIn = 5 * 60; // seconds

export function createEdgeJwt(expiresIn: ExpiresIn = FIVE_MINUTES) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }

  const payload = {
    aud: 'authenticated',
    role: 'service_role',
    iss: 'edge-client',
  } satisfies jwt.JwtPayload;

  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn,
  };

  return jwt.sign(payload, secret, options);
}

export function createEdgeHeaders(options?: {
  jwtExpiresIn?: ExpiresIn;
  includeApikey?: boolean;
}) {
  const token = createEdgeJwt(options?.jwtExpiresIn);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

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
