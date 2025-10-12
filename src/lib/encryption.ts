import { createEdgeHeaders } from '@/lib/supabase/jwt';
import { getEncryptionSessionToken } from '@/lib/encryption/context';

const PROJECT_REF = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch (error) {
    console.warn('[EncryptionService] Failed to derive project ref', error);
    return null;
  }
})();

const FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/encryption-service`
  : null;

const BATCH_DECRYPT_ENABLED = process.env.ENCRYPTION_BATCH_ENABLED === 'true';

class EncryptionServiceError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = 'EncryptionServiceError';
  }
}

type EncryptionResponse = {
  ciphertext?: string;
  plaintext?: string;
  valid?: boolean;
};

export type EncryptionRequestOptions = {
  sessionToken?: string | null;
};

class EncryptionService {
  constructor(private readonly serviceSecret: string = process.env.EDGE_SERVICE_SECRET || '') {
    if (!this.serviceSecret) {
      console.warn('[EncryptionService] EDGE_SERVICE_SECRET not configured; requests will fail');
    }
    if (!FUNCTION_URL) {
      console.warn('[EncryptionService] encryption-service function URL could not be derived');
    }
  }

  private async callEdge<TResponse extends EncryptionResponse>(
    payload: Record<string, unknown>,
    options: EncryptionRequestOptions = {},
  ): Promise<TResponse> {
    if (!FUNCTION_URL) {
      throw new Error('Encryption Edge Function URL is not configured');
    }
    if (!this.serviceSecret) {
      throw new Error('EDGE_SERVICE_SECRET is not configured');
    }

    const sessionToken = options.sessionToken ?? getEncryptionSessionToken();
    if (!sessionToken) {
      throw new Error('Supabase session token is required for encryption service requests');
    }

    const edgeHeaders = createEdgeHeaders({ jwtExpiresIn: '5m', includeAuthorization: false });
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.EDGE_SUPABASE_ANON_KEY;

    if (!apiKey) {
      throw new Error('Supabase anon key is required for encryption requests');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-service-secret': this.serviceSecret,
      ...edgeHeaders,
      Authorization: `Bearer ${apiKey}`,
      'x-client-info': 'encryption-service/1.0',
      'x-session-token': sessionToken,
    };

    if (process.env.ENCRYPTION_DEBUG === 'true') {
      console.debug('[EncryptionService] Calling edge', {
        hasSessionToken: Boolean(sessionToken),
        action: payload.action,
      });
    }

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw text
      }
      console.warn('[EncryptionService] Edge call failed', {
        status: response.status,
        parsed,
      });
      throw new EncryptionServiceError('encryption-service error', response.status, parsed);
    }

    try {
      return JSON.parse(text) as TResponse;
    } catch (error) {
      console.error('[EncryptionService] Failed to parse Edge Function response', error, text);
      throw new Error('Failed to parse encryption-service response');
    }
  }

  async encrypt(text: string, options?: EncryptionRequestOptions): Promise<string> {
    if (typeof text !== 'string') {
      throw new TypeError('encrypt expects a string');
    }
    if (text.length === 0) {
      return '';
    }
    const result = await this.callEdge<{ ciphertext: string }>({ action: 'encrypt', text }, options);
    if (!result.ciphertext) {
      throw new Error('encryption-service returned no ciphertext');
    }
    return result.ciphertext;
  }

  async decrypt(payload: string, options?: EncryptionRequestOptions): Promise<string> {
    if (typeof payload !== 'string') {
      throw new TypeError('decrypt expects a string');
    }
    if (payload.length === 0) {
      return '';
    }
    const result = await this.callEdge<{ plaintext: string }>({ action: 'decrypt', payload }, options);
    if (typeof result.plaintext !== 'string') {
      throw new Error('encryption-service returned no plaintext');
    }
    return result.plaintext;
  }

  async decryptMany(payloads: string[], options?: EncryptionRequestOptions): Promise<string[]> {
    if (!Array.isArray(payloads)) {
      throw new TypeError('decryptMany expects an array of strings');
    }
    if (payloads.length === 0) {
      return [];
    }
    const result = await this.callEdge<{ plaintexts: unknown }>({ action: 'multi-decrypt', payloads }, options);
    if (!Array.isArray(result.plaintexts)) {
      throw new Error('encryption-service returned invalid plaintexts');
    }
    if (result.plaintexts.length !== payloads.length) {
      throw new Error('encryption-service returned mismatched plaintext count');
    }
    return result.plaintexts.map((value) => (typeof value === 'string' ? value : ''));
  }

  async health(options?: EncryptionRequestOptions): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await this.callEdge<{ valid: boolean }>({ action: 'health' }, options);
      if (!response.valid) {
        return { valid: false, error: 'Encryption health check failed' };
      }
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: message };
    }
  }
}

let _service: EncryptionService | null = null;
const getEncryptionService = () => {
  if (!_service) {
    _service = new EncryptionService();
  }
  return _service;
};

export const encryptionService = {
  encrypt: async (text: string, options?: EncryptionRequestOptions) =>
    getEncryptionService().encrypt(text, options),
  decrypt: async (payload: string, options?: EncryptionRequestOptions) =>
    getEncryptionService().decrypt(payload, options),
  decryptMany: async (payloads: string[], options?: EncryptionRequestOptions) =>
    getEncryptionService().decryptMany(payloads, options),
};

export async function encrypt(text: string, options?: EncryptionRequestOptions): Promise<string> {
  return encryptionService.encrypt(text, options);
}

export async function decrypt(payload: string, options?: EncryptionRequestOptions): Promise<string> {
  return encryptionService.decrypt(payload, options);
}

export async function decryptMany(payloads: string[], options?: EncryptionRequestOptions): Promise<string[]> {
  return encryptionService.decryptMany(payloads, options);
}

export async function validateEncryptionSetup(): Promise<{ valid: boolean; error?: string }> {
  const service = getEncryptionService();
  const sessionToken =
    getEncryptionSessionToken() ?? process.env.ENCRYPTION_HEALTH_SESSION_TOKEN ?? null;
  const health = await service.health({ sessionToken });
  if (!health.valid) {
    return health;
  }

  try {
    const testString = 'test_encryption_validation';
    const encrypted = await service.encrypt(testString, { sessionToken });
    const decrypted = await service.decrypt(encrypted, { sessionToken });
    if (decrypted !== testString) {
      return { valid: false, error: 'Encryption/decryption test failed' };
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating encryption setup',
    };
  }
}

export { EncryptionServiceError };

export function isEncryptionBatchEnabled(): boolean {
  return BATCH_DECRYPT_ENABLED;
}
