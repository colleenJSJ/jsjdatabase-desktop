# API Error Fixes - Migration Instructions

## Overview
This migration fixes all the API errors you were experiencing by:
1. Adding missing columns to existing tables
2. Creating missing tables (medications, doctors)
3. Fixing table naming issues (trips vs travel_trips)
4. Setting up proper RLS policies

## Steps to Apply the Migration

### 1. Open Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor (usually in the left sidebar)

### 2. Run the Migration
1. Copy the entire contents of `20250821_fix_api_errors.sql`
2. Paste it into the SQL Editor
3. Click "Run" or press Ctrl/Cmd + Enter

### 3. Verify the Migration
After running the migration, verify that:
- No errors were reported in the output
- The following tables exist: `doctors`, `medications`, `trip_travelers`
- The view `trips` exists (maps to `travel_trips`)

## What This Migration Fixes

### Missing Columns
- `users.is_active` - Added with default value `true`
- `trusted_devices.last_used_at` - Added with default timestamp
- `travel_trips.is_archived` - Added with default value `false`
- `travel_trips` - Added multiple columns for hotel info, status, cost, etc.

### Missing Tables
- `doctors` - Healthcare provider information
- `medications` - Medication tracking for family members
- `trip_travelers` - Junction table for trip participants

### Table Name Issues
- Created a view `trips` that maps to `travel_trips` for API compatibility

### Security
- Added RLS policies for all new tables
- Added appropriate indexes for performance

## Post-Migration Steps

1. **Test the APIs**: After running the migration, test each API endpoint:
   - `/api/account/trusted-devices` - Should now work
   - `/api/auth/users` - Should now work
   - `/api/trips` - Should now work
   - `/api/medications` - Should now work
   - `/api/doctors` - Should now work

2. **Monitor for Errors**: Keep the terminal running and watch for any new errors

3. **Clear Browser Cache**: If you still see errors in the UI, try clearing your browser cache

## Rollback (if needed)
If you need to rollback these changes, you can run:
```sql
-- Drop the view
DROP VIEW IF EXISTS public.trips;

-- Drop new tables
DROP TABLE IF EXISTS public.medications;
DROP TABLE IF EXISTS public.doctors;
DROP TABLE IF EXISTS public.trip_travelers;

-- Remove columns (be careful with this as it will delete data)
ALTER TABLE public.users DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.trusted_devices DROP COLUMN IF EXISTS last_used_at;
ALTER TABLE public.travel_trips 
  DROP COLUMN IF EXISTS is_archived,
  DROP COLUMN IF EXISTS hotel_name,
  DROP COLUMN IF EXISTS hotel_confirmation,
  DROP COLUMN IF EXISTS hotel_address,
  DROP COLUMN IF EXISTS hotel_check_in,
  DROP COLUMN IF EXISTS hotel_check_out,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS total_cost,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS trip_type,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS title;
```

## Notes
- The migration uses `IF NOT EXISTS` clauses, so it's safe to run multiple times
- All new columns have sensible defaults, so existing data won't be affected
- The `trips` view allows the API to work without code changes