import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// One-time warning for missing environment variables
let hasWarnedAboutEnv = false;

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check for missing environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!hasWarnedAboutEnv) {
      console.warn('[Supabase Client] Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey
      });
      hasWarnedAboutEnv = true;
    }
    throw new Error('Missing Supabase environment variables');
  }

  try {
    const cookieStore = await cookies();

    return createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore errors in Server Components
            }
          },
        },
      }
    );
  } catch (error) {
    console.error('[Supabase Client] Failed to create client:', error);
    throw new Error('Failed to initialize Supabase client');
  }
}

export async function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    if (!hasWarnedAboutEnv) {
      console.warn('[Supabase Service Client] Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceRoleKey
      });
      hasWarnedAboutEnv = true;
    }
    throw new Error('Missing Supabase service environment variables');
  }
  
  try {
    return createServerClient(
      supabaseUrl,
      serviceRoleKey,
      {
        cookies: {
          getAll() {
            return [];
          },
          setAll() {},
        },
      }
    );
  } catch (error) {
    console.error('[Supabase Service Client] Failed to create client:', error);
    throw new Error('Failed to initialize Supabase service client');
  }
}