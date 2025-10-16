// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3'

type DenoSupabaseEnv = typeof globalThis & {
  Deno?: {
    env: {
      get(key: string): string | undefined
    }
    serve: typeof serve
  }
}

const denoGlobal = globalThis as DenoSupabaseEnv
const env = denoGlobal.Deno?.env

const SUPABASE_URL =
  env?.get('EDGE_SUPABASE_URL') ?? env?.get('SUPABASE_URL') ?? null
const SERVICE_ROLE_KEY =
  env?.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ?? env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? null
const EDGE_SERVICE_SECRET = env?.get('EDGE_SERVICE_SECRET') ?? null

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[activity-log] Missing Supabase configuration')
  throw new Error('Supabase configuration missing for activity-log function')
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

type LogPayload = {
  userId?: string
  action?: string
  entityType?: string
  entityId?: string | null
  entityName?: string | null
  page?: string | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
  timestamp?: string | null
}

type EdgeResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}

const JSON_HEADERS = {
  'content-type': 'application/json'
}

function jsonResponse<T>(payload: EdgeResponse<T>, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    ...init
  })
}

function validatePayload(payload: LogPayload): { ok: true } | { ok: false; error: string } {
  if (!payload.userId || payload.userId.trim().length === 0) {
    return { ok: false, error: 'userId is required' }
  }

  if (!payload.action || payload.action.trim().length === 0) {
    return { ok: false, error: 'action is required' }
  }

  if (!payload.entityType || payload.entityType.trim().length === 0) {
    return { ok: false, error: 'entityType is required' }
  }

  return { ok: true }
}

async function handleLogRequest(payload: LogPayload): Promise<Response> {
  const validation = validatePayload(payload)
  if (!validation.ok) {
    return jsonResponse({ ok: false, error: validation.error }, { status: 400 })
  }

  const timestamp = payload.timestamp ?? new Date().toISOString()

  const { error } = await adminClient
    .from('activity_logs')
    .insert({
      user_id: payload.userId,
      action: payload.action?.toLowerCase(),
      entity_type: payload.entityType?.toLowerCase(),
      entity_id: payload.entityId ?? null,
      entity_name: payload.entityName ?? null,
      page: payload.page ?? null,
      details: payload.details ?? {},
      ip_address: payload.ipAddress ?? null,
      user_agent: payload.userAgent ?? null,
      created_at: timestamp
    })

  if (error) {
    console.error('[activity-log] Failed to insert log', error)
    return jsonResponse(
      { ok: false, error: 'Failed to record activity' },
      { status: 500 }
    )
  }

  return jsonResponse({ ok: true })
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('Deno serve is not available in this environment')
}

denoGlobal.Deno.serve(async (request) => {
  if (EDGE_SERVICE_SECRET) {
    const provided = request.headers.get('x-service-secret')
    if (!provided || provided !== EDGE_SERVICE_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, { status: 405 })
  }

  try {
    const payload = (await request.json()) as LogPayload
    return await handleLogRequest(payload)
  } catch (error) {
    console.error('[activity-log] Invalid request', error)
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, { status: 400 })
  }
})
