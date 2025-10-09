# API Response Standardization Plan

## Goal
Update every API route to respond with a consistent envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

On errors:

```json
{
  "success": false,
  "error": "human readable message",
  "code": "optional machine code"
}
```

Where useful, include additional metadata (`meta`, `pagination`, etc.) under explicit keys.

## Helper utilities
Introduce a helper in `app/api/_helpers/responses.ts`:

```ts
export function success<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function failure(message: string, options?: { status?: number; code?: string; meta?: Record<string, unknown> }) {
  const { status = 400, code, meta } = options ?? {};
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}), ...(meta ? { meta } : {}) }, { status });
}
```

Routes can still include legacy fields temporarily (e.g. `{ success: true, data, contact }`) until the callers are updated.

## Migration steps (per feature)
1. **Inventory callers**  
   Identify every client/module that consumes the route (using `rg` for the endpoint path).
2. **Update route**  
   Replace inline `NextResponse.json` calls with the helper. Include legacy fields if the callers still expect them.
3. **Update client**  
   Switch callers to read from `response.data`/`response.error`. Capture any derived fields under `meta`.
4. **Regression smoke test**  
   Trigger the affected UI/API workflows to ensure responses parse correctly.
5. **Remove legacy fields** once all callers read from the new shape.
6. **Record progress** in the table below.

## Migration tracker
| Feature / Route Group | Primary consumers | Route(s) | Legacy fields kept? | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Admin users | `app/(authenticated)/admin/settings/page.tsx` | `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/users/add` | No | ☑ | Responses now return `{ success, data }`; admin UI updated |
| Contacts | `household`, `contacts`, `travel`, `pets` modules | `/api/contacts`, `/api/contacts/[id]`, `/api/contacts/categories`, `/api/contacts/sync` | No | ☑ | Clients now read `data.*`; legacy fields kept during rollout |
| Activity logging | Admin activity log page, password export | `/api/activity` | No | ☑ | Responses standardized; dashboard widget and export logger updated |
| Documents | Documents/Health/Pets/J3 | `/api/documents`, `/api/documents/upload`, `/api/documents/[id]`, `/api/documents/by-ids` | Yes | ☑ | Legacy keys (`documents`, `document`, `signedUrl`) kept while remaining fetch callers migrate |
| Passwords | Passwords page | `/api/passwords`, `/api/passwords/[id]` | TBD | ☐ | |
| Tasks | Tasks/Gantt widgets | `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/comments` | TBD | ☐ | |
| Travel | Travel dashboards | `/api/travel`, `/api/travel-details`, `/api/travel-accommodations`, `/api/travel-contacts` | TBD | ☐ | |
| Health | Health app | `/api/health`, `/api/health/appointments`, `/api/medications` | TBD | ☐ | |
| Search | Global search | `/api/search` | TBD | ☐ | |
| Authentication | Login/session diagnostics | `/api/auth/*`, `/api/test-auth` | TBD | ☐ | |
| Notifications | Notification feeds & toasts | `/api/announcements`, `/api/recent-contacts` | TBD | ☐ | |

Update the table as each group is migrated: mark the status (`☑` once complete), note if legacy fields were removed, and list any downstream fixes applied.

## Additional considerations
- **OpenAPI/Docs**: once stabilized, document the envelope format so external consumers have a reliable contract.
- **Analytics/logging**: if you emit logs based on response bodies, update them to leverage the `success` flag.
- **Error codes**: consider standardizing `code` values for common failures (e.g., `CONTACT_NOT_FOUND`, `NOT_AUTHORIZED`).
- **Tests**: add/adjust integration tests to assert the new envelope.
