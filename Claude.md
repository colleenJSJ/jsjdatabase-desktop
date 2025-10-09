# Johnson Database v1 - Claude Context

## Project Overview
- **Type**: Electron desktop application (macOS)
- **Framework**: Next.js 15 + React 19 + TypeScript
- **Purpose**: Family office management system with calendar, contacts, travel, health tracking
- **Current Version**: 0.1.27 (in build)
- **Repository**: colleenJSJ/jsjdatabase-desktop

## Current Status (2025-10-01)
**Working on**: Fixing auto-updater for macOS releases
- v0.1.27 build currently in progress (https://github.com/colleenJSJ/jsjdatabase-desktop/actions/runs/18171136550)
- Testing required: Verify zip file is generated and auto-updater works from v0.1.22 → v0.1.27

## Critical Technical Constraints

### Electron Auto-Updater (macOS)
- **Requires**: `.zip` files for in-place updates (NOT `.dmg`)
- **DMG usage**: Manual first-time installations only
- **Issue discovered**: Workflow was hardcoded to build only DMG, overriding package.json
- **Fix applied**:
  - package.json: `build.mac.target: ["dmg", "zip"]`
  - workflow: Changed from `--mac dmg` to `--mac` (respects package.json)
- **Release process**: Must publish GitHub releases (drafts don't work with auto-updater)

### API Key Management
**Google Maps API**:
- Only uses Places API (Autocomplete)
- Components: AirportAutocomplete, AddressAutocomplete, DestinationAutocomplete
- Key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (env variable)
- Security: Add HTTP referrer restrictions in Google Cloud Console (localhost:3007, 127.0.0.1)

**Supabase**:
- Anon key: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by app, safe for client)
- Service role key: Server-side only, DO NOT commit to code
- Storage: `.env.local` (dev), GitHub Secrets (CI/CD)

## Quick Reference

### Google Cloud Configuration
- **Project**: My First Project (smiling-breaker-469018-r3)
- **Exposed API Key**: Maps Platform API Key (459c3737-31d1-4d79-88c8-cfd75851cd89)
- **API in Use**: Places API only (Autocomplete widget)
- **NOT using**: Maps JavaScript API, Geocoding, Directions, Distance Matrix

### Security Configuration Applied
- **API Restrictions**: Restrict key to Places API only in Google Cloud Console
- **Application Restrictions**: HTTP referrers (websites)
  - `http://localhost:3007/*`
  - `http://127.0.0.1:*/*`
- **Gotcha**: Electron apps load locally, so referrer restrictions work for dev server
  - Production builds run on localhost/127.0.0.1, not external domains
  - Cannot use IP restrictions (dynamic local IPs)
  - Billing alerts recommended as additional protection

### Usage Locations in Code
- `lib/utils/google-maps-loader.ts` - Singleton loader, reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `components/ui/airport-autocomplete.tsx` - Establishment search
- `components/ui/address-autocomplete.tsx` - Physical address search
- `components/ui/destination-autocomplete.tsx` - City/destination search
- `components/travel/shared/TravelSegmentFields.tsx` - Flight booking integration

## Tech Stack

### Frontend
- Next.js 15.4.6 (App Router)
- React 19.1.0
- TypeScript 5.9.2
- Tailwind CSS 3.4.17
- Shadcn UI components

### Backend/Services
- Supabase (PostgreSQL, Auth, Storage)
- Google APIs: Calendar, Gmail (via googleapis), Maps Places
- Backblaze B2 (file storage)
- Anthropic API (AI features)

### Desktop
- Electron 38.2.0
- electron-builder (packaging)
- electron-updater (auto-updates)

### Build/Deploy
- GitHub Actions (macOS runners)
- Release workflow: Tag-triggered (v* or *.*.*)
- Node.js 20

## Recent Security Issues (Resolved)

1. **Supabase service_role key exposed** (2025-10-01)
   - Found in: `scripts/test-timestamp-format.ts` (debug script)
   - Action: File deleted, commit 2e0d563
   - Impact: None (key not used by app, only in test script)

2. **Google Maps API unrestricted** (2025-10-01)
   - Action needed: Add HTTP referrer restrictions in Google Cloud Console
   - Only enable: Places API
   - Not a code issue (key properly in env variables)

## Build & Release Process

### Local Development
```bash
npm run dev          # Start dev server on port 3007
npm run build        # Build Next.js app
npm run release      # Build Electron app locally
```

### GitHub Release
1. Update version in package.json
2. Commit changes
3. Create and push git tag: `git tag v0.1.X && git push origin v0.1.X`
4. GitHub Actions builds automatically
5. **Must publish draft release** for auto-updater to work

### Auto-updater Flow
- User checks for updates in Admin Settings
- App fetches `latest-mac.yml` from GitHub releases
- Downloads `.zip` file (not DMG)
- Extracts and applies update in-place
- Restarts app with new version

## Known Issues & Solutions

**Auto-updater "ZIP file not provided" error**:
- Cause: Build only generated DMG
- Solution: Workflow now builds both DMG and ZIP (fixed in v0.1.27)

**Timezone handling**:
- Fixed in v0.1.23-v0.1.25
- Uses Temporal API for proper timezone offset handling
- Backfill script created (695 events verified)

## How to Keep This Updated

**When to update this file**:
1. Version changes (update "Current Version" and "Current Status")
2. New technical constraints discovered (add to "Critical Technical Constraints")
3. Major architecture decisions or patterns established
4. Security issues found/resolved (update "Recent Security Issues")
5. New APIs or services integrated (update "Tech Stack")

**What NOT to include**:
- Detailed feature lists (that's for product docs)
- Individual bug fixes (unless they reveal patterns)
- Commit history (use git log for that)
- Code snippets (link to files instead)

**Keep it**: Under 300 lines, focused on what future Claude sessions need to know RIGHT NOW.
