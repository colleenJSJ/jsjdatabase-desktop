// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3'

type PortalType = 'medical' | 'pet' | 'academic'

type PortalPasswordSyncConfig = {
  providerType: PortalType
  providerId?: string
  providerName: string
  portalName?: string
  portalId?: string
  portal_url: string
  portal_username: string
  portal_password: string
  ownerId: string
  sharedWith: string[]
  createdBy: string
  notes?: string | null
  source?: string
  sourcePage?: string
  entityIds?: string[]
}

type SyncResponse = {
  success: boolean
  portal: Record<string, unknown> | null
  password: Record<string, unknown> | null
  error?: string
}

type DeletePortalResponse = {
  deletedPortal: boolean
  deletedPasswords: number
}

const denoGlobal = globalThis as typeof globalThis & {
  Deno?: typeof Deno
}

const denoEnv = denoGlobal.Deno?.env

const SUPABASE_URL =
  denoEnv?.get('EDGE_SUPABASE_URL') ?? denoEnv?.get('SUPABASE_URL') ?? null
const SUPABASE_SERVICE_ROLE_KEY =
  denoEnv?.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ??
  denoEnv?.get('SUPABASE_SERVICE_ROLE_KEY') ??
  null

const EDGE_SERVICE_SECRET = denoEnv?.get('EDGE_SERVICE_SECRET') ?? null

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[portal-sync] Missing required Supabase configuration. Set EDGE_SUPABASE_URL and EDGE_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
  )
  throw new Error('Supabase configuration is incomplete for portal-sync')
}

const PROJECT_REF = (() => {
  try {
    const { host } = new URL(SUPABASE_URL)
    const match = host.match(/^([^.]+)\.supabase\.co$/)
    return match ? match[1] : null
  } catch {
    return null
  }
})()

const FUNCTIONS_BASE_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.functions.supabase.co`
  : null

const JSON_HEADERS = {
  'content-type': 'application/json'
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: JSON_HEADERS,
    ...init
  })
}

function normalizeUrl(input: string): string {
  if (!input) return ''
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.startsWith('www.')) {
    return `https://${trimmed}`
  }
  return `https://${trimmed}`
}

function extractDomain(url: string): string {
  try {
    const normalized = normalizeUrl(url)
    const parsed = new URL(normalized)
    return parsed.hostname.toLowerCase()
  } catch {
    return url.toLowerCase().trim()
  }
}

function getCategoryForProviderType(providerType: PortalType): string {
  switch (providerType) {
    case 'medical':
      return 'Health'
    case 'pet':
      return 'Pets'
    case 'academic':
      return 'J3 Academics'
    default:
      return 'Other'
  }
}

async function encryptValue(
  value: string | null | undefined
): Promise<string | null> {
  if (value === null || value === undefined) {
    return null
  }

  if (value === '') {
    return ''
  }

  if (!FUNCTIONS_BASE_URL) {
    throw new Error('Functions base URL is not configured')
  }

  const response = await fetch(`${FUNCTIONS_BASE_URL}/encryption-service`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(EDGE_SERVICE_SECRET ? { 'x-service-secret': EDGE_SERVICE_SECRET } : {})
    },
    body: JSON.stringify({
      action: 'encrypt',
      text: value
    })
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `[portal-sync] Encryption service failed (${response.status}): ${text}`
    )
  }

  const data = (await response.json()) as { ciphertext?: string }
  if (typeof data.ciphertext !== 'string') {
    throw new Error('[portal-sync] Encryption service returned invalid payload')
  }

  return data.ciphertext
}

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  })
}

async function resolveUserIdFromToken(
  jwt?: string | null
): Promise<string | null> {
  if (!jwt) return null
  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error) {
    console.warn('[portal-sync] Failed to validate session token', error)
    return null
  }
  return data.user?.id ?? null
}

async function handleSyncAction(
  config: PortalPasswordSyncConfig,
  sessionUserId: string
): Promise<SyncResponse> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  try {
    const normalizedUrl = normalizeUrl(config.portal_url)
    const domain = extractDomain(config.portal_url)

    const portalName =
      (config.portalName ?? config.providerName ?? 'Portal').trim() ||
      config.providerName
    const encryptedPortalPassword = config.portal_password
      ? await encryptValue(config.portal_password)
      : null

    const ownerUserId = config.ownerId || config.createdBy || sessionUserId
    const sharedCandidates = new Set(
      (config.sharedWith ?? [])
        .concat(
          config.createdBy && config.createdBy !== ownerUserId
            ? [config.createdBy]
            : []
        )
        .filter(Boolean)
    )
    sharedCandidates.delete(ownerUserId)
    const cleanSharedWith = Array.from(sharedCandidates)

    const portalEntities = Array.from(
      new Set((config.entityIds ?? []).filter((id): id is string => !!id))
    )

    let portal: Record<string, unknown> | null = null

    if (config.portalId) {
      const { data, error } = await supabase
        .from('portals')
        .select('*')
        .eq('id', config.portalId)
        .maybeSingle()
      if (!error && data) {
        portal = data as Record<string, unknown>
      }
    }

    if (!portal) {
      const { data } = await supabase
        .from('portals')
        .select('*')
        .eq('portal_type', config.providerType)
        .ilike('provider_name', config.providerName.toLowerCase().trim())
        .maybeSingle()

      if (data) {
        portal = data as Record<string, unknown>
      }
    }

    if (portal) {
      const updatePayload: Record<string, unknown> = {
        portal_name: portalName,
        provider_name: config.providerName,
        portal_url: normalizedUrl,
        username: config.portal_username || null,
        password: encryptedPortalPassword,
        entity_id: config.providerId ?? (portal.entity_id as string | null) ?? null,
        updated_at: now
      }

      if (portalEntities.length > 0) {
        updatePayload.patient_ids = portalEntities
      }

      if (config.notes !== undefined) {
        updatePayload.notes = config.notes
      }

      const { data: updatedPortal, error: updateError } = await supabase
        .from('portals')
        .update(updatePayload)
        .eq('id', portal.id)
        .select()
        .single()

      if (updateError) throw updateError
      portal = updatedPortal as Record<string, unknown>
    } else {
      const insertPayload: Record<string, unknown> = {
        portal_type: config.providerType,
        portal_name: portalName,
        portal_url: normalizedUrl,
        username: config.portal_username || null,
        password: encryptedPortalPassword,
        provider_name: config.providerName,
        entity_id: config.providerId ?? null,
        patient_ids: portalEntities,
        notes: config.notes ?? null,
        created_by: config.createdBy || sessionUserId,
        updated_at: now
      }

      const { data: newPortal, error: createError } = await supabase
        .from('portals')
        .insert(insertPayload)
        .select()
        .single()

      if (createError) throw createError
      portal = newPortal as Record<string, unknown>
    }

    if (!portal) {
      throw new Error('Portal record could not be created or updated')
    }

    const source = config.source || config.providerType

    const entityIds = Array.from(
      new Set((config.entityIds || []).filter(Boolean))
    )
    const entityTags =
      entityIds.length > 0 ? entityIds.map((id) => `family:${id}`) : undefined

    const passwordBaseData: Record<string, unknown> = {
      service_name: portalName,
      title: portalName,
      username: config.portal_username,
      password: config.portal_password
        ? await encryptValue(config.portal_password)
        : null,
      url: normalizedUrl,
      website_url: normalizedUrl,
      category: getCategoryForProviderType(config.providerType),
      owner_id: ownerUserId,
      shared_with: cleanSharedWith,
      is_shared: cleanSharedWith.length > 0,
      source,
      source_reference: portal.id,
      tags: entityTags ?? [],
      is_favorite: false,
      created_by: config.createdBy || sessionUserId,
      updated_at: now,
      last_changed: now
    }

    if (config.notes !== undefined) {
      passwordBaseData.notes = config.notes
        ? await encryptValue(config.notes)
        : null
    }

    const portalPasswordId = portal.password_id as string | undefined
    let password: Record<string, unknown> | null = null

    if (portalPasswordId) {
      const { data } = await supabase
        .from('passwords')
        .select('*')
        .eq('id', portalPasswordId)
        .maybeSingle()
      if (data) {
        password = data as Record<string, unknown>
      }
    }

    if (!password) {
      const { data } = await supabase
        .from('passwords')
        .select('*')
        .eq('owner_id', ownerUserId)
        .eq('username', config.portal_username)
        .or(
          `website_url.ilike.%${domain}%,url.ilike.%${domain}%`,
          { foreignTable: undefined }
        )

      if (data && Array.isArray(data)) {
        password =
          data.find(
            (p) =>
              p.username === config.portal_username &&
              ((p.website_url && p.website_url.includes(domain)) ||
                (p.url && p.url.includes(domain)))
          ) ?? null
      }
    }

    if (!password) {
      const { data } = await supabase
        .from('passwords')
        .select('*')
        .eq('source_reference', portal.id)
        .maybeSingle()
      if (data) {
        password = data as Record<string, unknown>
      }
    }

    if (password) {
      const existingTags = Array.isArray(password.tags)
        ? (password.tags as string[])
        : []
      const nonFamilyTags = existingTags.filter((tag) => !tag.startsWith('family:'))
      const mergedTags = entityTags
        ? Array.from(new Set([...nonFamilyTags, ...entityTags]))
        : existingTags

      const updatePayload: Record<string, unknown> = {
        ...passwordBaseData,
        tags: mergedTags,
        created_at: password.created_at ?? now
      }

      if (config.notes === undefined) {
        delete updatePayload.notes
      }

      const { data: updatedPassword, error: updateError } = await supabase
        .from('passwords')
        .update(updatePayload)
        .eq('id', password.id)
        .select()
        .maybeSingle()

      if (updateError || !updatedPassword) {
        throw updateError || new Error('Password update failed')
      }
      password = updatedPassword as Record<string, unknown>
    } else {
      const insertPayload: Record<string, unknown> = {
        ...passwordBaseData,
        created_at: now
      }

      const { data: newPassword, error: createError } = await supabase
        .from('passwords')
        .insert(insertPayload)
        .select()
        .single()

      if (createError) throw createError
      password = newPassword as Record<string, unknown>
    }

    if (password?.id !== portal.password_id) {
      await supabase
        .from('portals')
        .update({
          password_id: password?.id ?? null,
          updated_at: now
        })
        .eq('id', portal.id)
    }

    await supabase.from('activity_logs').insert({
      user_id: sessionUserId,
      action: portalPasswordId ? 'update' : 'create',
      entity_type: 'portal_password_sync',
      entity_id: portal.id,
      entity_name: config.providerName,
      page: config.source || 'portal_sync',
      details: {
        portal_id: portal.id,
        password_id: password?.id ?? null,
        provider_type: config.providerType,
        owner_id: config.ownerId,
        shared_with_count: cleanSharedWith.length
      },
      created_at: now
    })

    return {
      success: true,
      portal,
      password
    }
  } catch (error) {
    console.error('[portal-sync] Sync failed', error)
    return {
      success: false,
      portal: null,
      password: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function handleDeletePortal(
  portalId: string
): Promise<DeletePortalResponse> {
  const supabase = createAdminClient()

  const result: DeletePortalResponse = {
    deletedPortal: false,
    deletedPasswords: 0
  }

  const { data: portal, error: portalError } = await supabase
    .from('portals')
    .select('id, password_id')
    .eq('id', portalId)
    .maybeSingle()

  if (portalError) {
    throw new Error(
      `[portal-sync] Failed to fetch portal ${portalId}: ${portalError.message}`
    )
  }

  if (!portal) {
    return result
  }

  if (portal.password_id) {
    const { error } = await supabase
      .from('passwords')
      .delete()
      .eq('id', portal.password_id)
    if (!error) {
      result.deletedPasswords += 1
    }
  }

  const { data: linkedPasswords } = await supabase
    .from('passwords')
    .select('id')
    .eq('source_reference', portalId)

  if (linkedPasswords?.length) {
    const ids = linkedPasswords.map((p) => p.id)
    const { error } = await supabase
      .from('passwords')
      .delete()
      .in('id', ids)
    if (!error) {
      result.deletedPasswords += ids.length
    }
  }

  const { error: deletePortalError } = await supabase
    .from('portals')
    .delete()
    .eq('id', portalId)

  if (deletePortalError) {
    throw new Error(deletePortalError.message)
  }

  result.deletedPortal = true
  return result
}

if (denoGlobal.Deno?.serve) {
  denoGlobal.Deno.serve(async (request) => {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })
    }

    const authHeader = request.headers.get('authorization')
    let jwt: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      jwt = authHeader.slice('Bearer '.length)
    }

    const sessionUserId = await resolveUserIdFromToken(jwt)
    if (!sessionUserId) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    }

    let payload: {
      action?: string
      config?: PortalPasswordSyncConfig
      portalId?: string
    }

    try {
      payload = (await request.json()) as typeof payload
    } catch (error) {
      console.error('[portal-sync] Invalid JSON payload', error)
      return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const action = payload.action
    try {
      switch (action) {
        case 'sync': {
          if (!payload.config) {
            return jsonResponse(
              { error: 'config payload is required for sync action' },
              { status: 400 }
            )
          }
          const syncResult = await handleSyncAction(
            {
              ...payload.config,
              createdBy: payload.config.createdBy || sessionUserId
            },
            sessionUserId
          )
          return jsonResponse(syncResult, { status: syncResult.success ? 200 : 500 })
        }
        case 'delete_portal': {
          if (!payload.portalId) {
            return jsonResponse(
              { error: 'portalId is required for delete_portal action' },
              { status: 400 }
            )
          }
          const deleteResult = await handleDeletePortal(payload.portalId)
          return jsonResponse(deleteResult)
        }
        default:
          return jsonResponse({ error: 'Unsupported action' }, { status: 400 })
      }
    } catch (error) {
      console.error('[portal-sync] Internal error', error)
      return jsonResponse(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }
  })
}
