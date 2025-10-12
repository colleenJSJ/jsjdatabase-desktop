import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.4.1/index.ts';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

type DenoGlobal = typeof globalThis & {
  Deno?: {
    env?: {
      get(key: string): string | undefined;
    };
    serve?: (
      handler: (request: Request) => Response | Promise<Response>,
      options?: Record<string, unknown>,
    ) => Promise<void> | void;
  };
};

const denoGlobal = (globalThis as DenoGlobal).Deno;
const denoEnv = denoGlobal?.env;

const EDGE_SECRET = denoEnv?.get('EDGE_SERVICE_SECRET');
const ENCRYPTION_KEY = denoEnv?.get('ENCRYPTION_KEY');
const SUPABASE_URL = denoEnv?.get('EDGE_SUPABASE_URL');
const SUPABASE_ANON_KEY = denoEnv?.get('EDGE_SUPABASE_ANON_KEY') || denoEnv?.get('EDGE_SUPABASE_SERVICE_ROLE_KEY');
const REQUIRED_HEX_LENGTH = 64; // 32 bytes
const REQUIRED_KEY_BYTES = 32;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const JWKS = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  : null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey: CryptoKey | null = null;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: JSON_HEADERS,
    ...init,
  });
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toBufferSource(value: Uint8Array | ArrayBuffer): BufferSource {
  return value as unknown as BufferSource;
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not configured in the Edge environment');
  }
  if (!/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be hexadecimal');
  }
  if (ENCRYPTION_KEY.length !== REQUIRED_HEX_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${REQUIRED_HEX_LENGTH} hex characters`);
  }

  const rawKey = hexToUint8Array(ENCRYPTION_KEY);
  if (rawKey.length !== REQUIRED_KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${REQUIRED_KEY_BYTES} bytes`);
  }

  cachedKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(rawKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedKey;
}

async function encryptText(plainText: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = encoder.encode(plainText);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(encoded),
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  if (encryptedBytes.length <= 16) {
    throw new Error('Encrypted payload too short to contain auth tag');
  }
  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);

  const ivHex = uint8ArrayToHex(iv);
  const authTagHex = uint8ArrayToHex(authTag);
  const cipherHex = uint8ArrayToHex(cipherBytes);

  return `${ivHex}:${authTagHex}:${cipherHex}`;
}

async function decryptText(payload: string): Promise<string> {
  const tryBase64 = (value: string): string => {
    try {
      return atob(value);
    } catch {
      return value;
    }
  };

  if (!payload.includes(':')) {
    return tryBase64(payload);
  }

  const [ivHex, authTagHex, cipherHex] = payload.split(':');
  if (!ivHex || !authTagHex || !cipherHex) {
    return tryBase64(payload);
  }

  try {
    const key = await getCryptoKey();
    const iv = hexToUint8Array(ivHex);
    const authTag = hexToUint8Array(authTagHex);
    const cipherBytes = hexToUint8Array(cipherHex);

    const combined = new Uint8Array(cipherBytes.length + authTag.length);
    combined.set(cipherBytes);
    combined.set(authTag, cipherBytes.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(iv) },
      key,
      toBufferSource(combined),
    );

    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.warn('[encryption-service] AES decrypt failed, falling back to base64', error);
    return tryBase64(payload);
  }
}

async function authorizeRequest(request: Request): Promise<Response | null> {
  const secretHeader = request.headers.get('x-service-secret');

  if (EDGE_SECRET && secretHeader !== EDGE_SECRET) {
    console.warn('[encryption-service] Invalid service secret');
    return jsonResponse({ error: 'invalid_service_secret' }, { status: 401 });
  }

  const sessionToken = request.headers.get('x-session-token');
  if (!sessionToken) {
    console.warn('[encryption-service] Missing session token');
    return jsonResponse({ error: 'missing_session_token' }, { status: 401 });
  }

  if (!JWKS || !SUPABASE_URL) {
    console.error('[encryption-service] JWKS not configured');
    return jsonResponse({ error: 'server_not_configured' }, { status: 500 });
  }

  try {
    const { payload } = await jwtVerify(sessionToken, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    return payload ? null : jsonResponse({ error: 'invalid_session_token' }, { status: 401 });
  } catch (error) {
    console.warn('[encryption-service] Session token validation failed', error);
    return jsonResponse({ error: 'invalid_session_token', message: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
}

if (denoGlobal?.serve) {
  denoGlobal.serve(async (request) => {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
    }

    const authError = await authorizeRequest(request);
    if (authError) {
      return authError;
    }

    let body: { action?: string; text?: string; payload?: string };
    try {
      body = await request.json();
    } catch (error) {
      console.error('[encryption-service] Invalid JSON payload', error);
      return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const action = body.action;
    try {
      switch (action) {
        case 'encrypt': {
          if (typeof body.text !== 'string') {
            return jsonResponse({ error: 'text is required for encrypt action' }, { status: 400 });
          }
          const encrypted = await encryptText(body.text);
          return jsonResponse({ ciphertext: encrypted });
        }
        case 'decrypt': {
          if (typeof body.payload !== 'string') {
            return jsonResponse({ error: 'payload is required for decrypt action' }, { status: 400 });
          }
          const decrypted = await decryptText(body.payload);
          return jsonResponse({ plaintext: decrypted });
        }
        case 'health': {
          const key = await getCryptoKey();
          const test = 'test_encryption_validation';
          const encrypted = await encryptText(test);
          const decrypted = await decryptText(encrypted);
          const valid = decrypted === test && !!key;
          return jsonResponse({ valid });
        }
        default:
          return jsonResponse({ error: 'Unsupported action' }, { status: 400 });
      }
    } catch (error) {
      console.error('[encryption-service] Error processing request', error);
      return jsonResponse({
        error: 'Encryption service failed',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }
  });
}

export {};
