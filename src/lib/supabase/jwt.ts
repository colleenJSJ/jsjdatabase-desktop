import { createPrivateKey } from 'crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

type ExpiresIn = SignOptions['expiresIn'];

const FIVE_MINUTES: ExpiresIn = 5 * 60; // seconds

export function createEdgeJwt(expiresIn: ExpiresIn = FIVE_MINUTES) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }
  const supabaseUrl =
    process.env.EDGE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured');
  }

  const normalizedSecret = secret.includes('\\n')
    ? secret.replace(/\\n/g, '\n')
    : secret;

  const payload: jwt.JwtPayload = {
    aud: 'authenticated',
    role: 'service_role',
    iss: `${supabaseUrl.replace(/\\/$/, '')}/auth/v1`,
    sub: 'service-role',
  };

  let algorithm: SignOptions['algorithm'] = 'HS256';
  let signingKey: jwt.Secret = normalizedSecret;

  if (normalizedSecret.trim().startsWith('-----BEGIN')) {
    const key = createPrivateKey(normalizedSecret);
    switch (key.asymmetricKeyType) {
      case 'rsa':
        algorithm = 'RS256';
        break;
      case 'ec': {
        // Default to ES256; upgrade to higher curves when available
        const curve = key.asymmetricKeyDetails?.namedCurve;
        if (curve && /384/.test(curve)) {
          algorithm = 'ES384';
        } else if (curve && /(521|512)/.test(curve)) {
          algorithm = 'ES512';
        } else {
          algorithm = 'ES256';
        }
        break;
      }
      case 'ed25519':
      case 'ed448':
        algorithm = 'EdDSA';
        break;
      default:
        throw new Error(`Unsupported asymmetric key type: ${key.asymmetricKeyType}`);
    }
    signingKey = { key: normalizedSecret, passphrase: undefined };
  }

  const options: SignOptions = {
    algorithm,
    expiresIn,
  };

  return jwt.sign(payload, signingKey, options);
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
