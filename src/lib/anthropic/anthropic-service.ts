import { createEdgeHeaders } from '@/lib/supabase/jwt';

class AnthropicServiceError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = 'AnthropicServiceError';
  }
}

const PROJECT_REF = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDGE_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).host;
    const match = host.match(/^([^.]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch (error) {
    console.warn('[AnthropicService] Failed to derive project ref', error);
    return null;
  }
})();

const FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/anthropic-proxy`
  : null;

type MessageContent = {
  role: string;
  content: Array<Record<string, unknown>>;
};

type MessagesCreateRequest = {
  model: string;
  messages: MessageContent[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
  [key: string]: unknown;
};

type MessagesCreateResponse = Record<string, unknown> & {
  content?: Array<{ type: string; text?: string }>;
};

class AnthropicService {
  constructor(private readonly serviceSecret: string = process.env.EDGE_SERVICE_SECRET || '') {
    if (!this.serviceSecret) {
      console.warn('[AnthropicService] EDGE_SERVICE_SECRET not configured; requests will fail');
    }
    if (!FUNCTION_URL) {
      console.warn('[AnthropicService] anthropic-proxy function URL could not be derived');
    }
  }

  private async callEdgeFunction<TResponse>(payload: Record<string, unknown>): Promise<TResponse> {
    if (!FUNCTION_URL) {
      throw new Error('Anthropic Edge Function URL is not configured');
    }
    if (!this.serviceSecret) {
      throw new Error('EDGE_SERVICE_SECRET is not configured');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-service-secret': this.serviceSecret,
      ...createEdgeHeaders({ jwtExpiresIn: '5m' }),
      'x-client-info': 'anthropic-service/1.0',
    };

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
      throw new AnthropicServiceError('anthropic-proxy error', response.status, parsed);
    }

    try {
      return JSON.parse(text) as TResponse;
    } catch (error) {
      console.error('[AnthropicService] Failed to parse Edge Function response', error, text);
      throw new Error('Failed to parse anthropic-proxy response');
    }
  }

  async createMessage(payload: MessagesCreateRequest): Promise<MessagesCreateResponse> {
    return this.callEdgeFunction<MessagesCreateResponse>({
      action: 'messages.create',
      payload,
    });
  }
}

let _service: AnthropicService | null = null;
export const getAnthropicService = () => {
  if (!_service) {
    _service = new AnthropicService();
  }
  return _service;
};

export type { MessagesCreateRequest, MessagesCreateResponse };
export { AnthropicServiceError };
