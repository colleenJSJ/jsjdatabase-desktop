import { createClient } from '@/lib/supabase/server';

export async function getCurrentUser() {
  const supabase = await createClient();
  
  // Use getUser for secure authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return null;
  }

  // Get full user data from the users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    return null;
  }

  return {
    id: userData.id,
    name: userData.full_name,
    email: userData.email,
    role: userData.role,
    is_active: userData.is_active
  };
}