# Component Consolidation Checklist

## Goal
Move all modules currently living under `src/components/` into the canonical `components/` tree while keeping feature behaviour stable. We will migrate one feature slice at a time, update every import, and smoke-test the affected screens immediately.

## Target structure
```
components/
  admin/
  calendar/
  contacts/
  dashboard/
  documents/
  layout/
  notifications/
  search/
  tasks/
  travel/
  ui/
  updates/
```

## Migration Steps (repeat per slice)
1. **Inventory imports**
   - `rg "@/components/<slice>` to list every consumer.
2. **Move files** from `src/components/<slice>` into `components/<slice>`.
3. **Rewrite imports**
   - Update aliases (`@/components/...` now resolves to the new location).
   - Replace any relative paths that still point at `../../components/...`.
4. **TypeScript & lint pass**
   - Run `npm run lint -- --max-warnings=0` (or `tsc --noEmit`) to catch bad paths.
5. **Feature smoke test**
   - Open the routes listed below for that slice, clicking through the relevant UI.
6. **Remove old directory** once no `rg "src/components` results remain.

Document each completed slice in the table below.

## Slice-by-slice plan
| Slice | Files to move (from `src/components/`) | Primary consumers | Post-move verification | Status |
| --- | --- | --- | --- | --- |
| Dashboard widgets | `dashboard/calendar-overview.tsx`, `dashboard/tasks-widget.tsx`, `dashboard/travel-widget.tsx`, `dashboard/weekly-announcements.tsx`, `dashboard/recent-activity.tsx` | `app/(authenticated)/dashboard/page.tsx`, `hooks/usePrefetch.tsx`, `lib/utils/bundle-manager.ts` | Load dashboard (widgets & prefetch hooks), ensure data fetches succeed | ☑ |
| Documents | `documents/document-card.tsx`, `document-helpers.tsx`, `document-list.tsx`, `document-preview-modal.tsx`, `document-upload-modal.tsx` | `app/(authenticated)/documents/page.tsx`, `app/(authenticated)/health/page.tsx`, `app/(authenticated)/j3-academics/J3AcademicsPageClient.tsx`, `app/(authenticated)/travel/TravelPageClient.tsx`, `app/(authenticated)/pets/PetsPageClient.tsx`, `hooks/usePrefetch.tsx`, `lib/utils/bundle-manager.ts` | Upload document, preview in each consumer page, confirm list renders | ☑ |
| Layout shell | `layout/dashboard-layout.tsx`, `layout/TimezoneSelector.tsx`, `layout/header.tsx`, `layout/sidebar.tsx`, `layout/mobile-nav.tsx` | `app/(authenticated)/layout.tsx` | Log in, ensure layout, sidebar, header, mobile nav, timezone selector behave | ☑ |
| Notifications | `notifications/RealtimeBridge.tsx`, `notifications/Toasts.tsx` | `components/layout/dashboard-layout.tsx`, notification hooks | Trigger notification, confirm toast + realtime updates | ☑ |
| Search | `search/global-search.tsx` | `components/layout/header.tsx` | Use global search, ensure autocomplete works | ☑ |
| Admin modals | `admin/add-user-modal.tsx`, `admin/category-management-tabs.tsx` | `app/(authenticated)/admin/settings/page.tsx` | Open admin settings, add user/category | ☑ |
| Tasks detail | `tasks/TaskDetailModal.tsx` | `app/(authenticated)/tasks/TasksPageClient.tsx`, `components/dashboard/tasks-widget.tsx` | Open task detail modal from tasks page and dashboard | ☑ |
| Updates banner | `updates/UpdateBanner.tsx` | `components/layout/dashboard-layout.tsx` | Toggle banner, verify dismissal workflow | ☑ |

## Notes & potential gotchas
- Some slices share stateful hooks from `providers/` or `contexts/`. Ensure imports remain routed through `@/` aliases after the move.
- `dashboard-layout` wires together notifications, search, and updates. Plan to migrate these slices together or within the same branch to avoid broken imports.
- After the final slice, run `rg "src/components"` and `rg "../components"` to ensure no stale paths remain. Follow with `next build`.
- Keep a running changelog of each slice (date, branch, QA notes) in this document as you progress.
