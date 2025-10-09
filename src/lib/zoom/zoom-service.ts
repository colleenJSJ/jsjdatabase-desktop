import { createEdgeHeaders } from '@/lib/supabase/jwt';

class ZoomServiceError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = 'ZoomServiceError';
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
    console.warn('[ZoomMeetingService] Failed to derive project ref', error);
    return null;
  }
})();

const FUNCTION_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co/zoom-meeting-service`
  : null;

type ZoomMeetingSettings = Record<string, unknown> | undefined;

type ZoomCreateMeetingResponse = {
  id: string | number;
  join_url: string;
  start_url: string;
  password?: string;
  settings?: ZoomMeetingSettings;
  raw?: Record<string, unknown>;
};

type ZoomCreateMeetingRequest = {
  topic: string;
  start_time: string;
  duration: number;
  timezone?: string;
  host_email?: string;
  settings?: ZoomMeetingSettings;
};

type ZoomUpdateMeetingRequest = {
  meeting_id: string | number;
  topic?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  settings?: ZoomMeetingSettings;
};

type ZoomDeleteMeetingRequest = {
  meeting_id: string | number;
  occurrence_id?: string;
};

class ZoomMeetingService {
  constructor(private readonly serviceSecret: string = process.env.EDGE_SERVICE_SECRET || '') {
    if (!this.serviceSecret) {
      console.warn('[ZoomMeetingService] EDGE_SERVICE_SECRET not configured; requests will fail');
    }
    if (!FUNCTION_URL) {
      console.warn('[ZoomMeetingService] zoom-meeting-service function URL could not be derived');
    }
  }

  private async callEdgeFunction<TResponse>(payload: Record<string, unknown>): Promise<TResponse> {
    if (!FUNCTION_URL) {
      throw new Error('Zoom meeting service Edge Function URL is not configured');
    }
    if (!this.serviceSecret) {
      throw new Error('EDGE_SERVICE_SECRET is not configured');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-service-secret': this.serviceSecret,
      ...createEdgeHeaders({ jwtExpiresIn: '5m' }),
      'x-client-info': 'zoom-service/1.0',
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
        // keep raw text if JSON parsing fails
      }
      throw new ZoomServiceError('zoom-meeting-service error', response.status, parsed);
    }

    try {
      return JSON.parse(text) as TResponse;
    } catch (error) {
      console.error('[ZoomMeetingService] Failed to parse Edge Function response', error, text);
      throw new Error('Failed to parse zoom-meeting-service response');
    }
  }

  async createMeeting(payload: ZoomCreateMeetingRequest): Promise<ZoomCreateMeetingResponse> {
    return this.callEdgeFunction<ZoomCreateMeetingResponse>({
      action: 'create_meeting',
      ...payload,
    });
  }

  async updateMeeting(payload: ZoomUpdateMeetingRequest): Promise<{ ok: true }> {
    return this.callEdgeFunction<{ ok: true }>({
      action: 'update_meeting',
      ...payload,
    });
  }

  async deleteMeeting(payload: ZoomDeleteMeetingRequest): Promise<{ ok: true }> {
    return this.callEdgeFunction<{ ok: true }>({
      action: 'delete_meeting',
      ...payload,
    });
  }
}

let _service: ZoomMeetingService | null = null;
export const getZoomMeetingService = () => {
  if (!_service) {
    _service = new ZoomMeetingService();
  }
  return _service;
};

export type {
  ZoomCreateMeetingRequest,
  ZoomCreateMeetingResponse,
  ZoomDeleteMeetingRequest,
  ZoomUpdateMeetingRequest,
};

export { ZoomServiceError };
