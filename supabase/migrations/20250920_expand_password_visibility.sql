-- Ensure all authenticated users can read password records for filtering purposes
-- while leaving write policies untouched.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'passwords'
      AND policyname = 'passwords_select_all_authenticated'
  ) THEN
    CREATE POLICY passwords_select_all_authenticated
      ON public.passwords
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

COMMIT;
