import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const authResult = await requireAdmin(request, { skipCSRF: true });
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();

    // Define categories for each module
    const taskCategories = [
      { name: 'Medical', module: 'tasks', color: '#7B9CC3', icon: '🏥', is_active: true },
      { name: 'Travel', module: 'tasks', color: '#8BA88B', icon: '✈️', is_active: true },
      { name: 'Household', module: 'tasks', color: '#D4B574', icon: '🏠', is_active: true },
      { name: 'Personal', module: 'tasks', color: '#AB9BBF', icon: '👤', is_active: true },
      { name: 'Pets', module: 'tasks', color: '#D3ABAB', icon: '🐾', is_active: true },
      { name: 'Work', module: 'tasks', color: '#D4B574', icon: '💼', is_active: true },
      { name: 'Family', module: 'tasks', color: '#8BA88B', icon: '👨‍👩‍👧‍👦', is_active: true },
      { name: 'Administrative', module: 'tasks', color: '#C2C0B6', icon: '📄', is_active: true },
      { name: 'Documents', module: 'tasks', color: '#9CA3AF', icon: '📁', is_active: true }
    ];

    const calendarCategories = [
      { name: 'Medical', module: 'calendar', color: '#7B9CC3', icon: '🏥', is_active: true },
      { name: 'Personal', module: 'calendar', color: '#AB9BBF', icon: '👤', is_active: true },
      { name: 'Work', module: 'calendar', color: '#D4B574', icon: '💼', is_active: true },
      { name: 'Family', module: 'calendar', color: '#8BA88B', icon: '👨‍👩‍👧‍👦', is_active: true },
      { name: 'Travel', module: 'calendar', color: '#8BA88B', icon: '✈️', is_active: true },
      { name: 'School', module: 'calendar', color: '#D4B574', icon: '🎓', is_active: true },
      { name: 'Other', module: 'calendar', color: '#AB9BBF', icon: '📌', is_active: true }
    ];

    const documentCategories = [
      { name: 'Legal', module: 'documents', color: '#7B9CC3', icon: '⚖️', is_active: true },
      { name: 'Financial', module: 'documents', color: '#D4B574', icon: '💰', is_active: true },
      { name: 'Medical', module: 'documents', color: '#7B9CC3', icon: '🏥', is_active: true },
      { name: 'Education', module: 'documents', color: '#D4B574', icon: '🎓', is_active: true },
      { name: 'Travel', module: 'documents', color: '#8BA88B', icon: '✈️', is_active: true },
      { name: 'Property', module: 'documents', color: '#C2C0B6', icon: '🏠', is_active: true },
      { name: 'Vehicles', module: 'documents', color: '#9CA3AF', icon: '🚗', is_active: true },
      { name: 'Personal', module: 'documents', color: '#AB9BBF', icon: '👤', is_active: true },
      { name: 'Work', module: 'documents', color: '#D4B574', icon: '💼', is_active: true },
      { name: 'Household', module: 'documents', color: '#D4B574', icon: '🏠', is_active: true },
      { name: 'Other', module: 'documents', color: '#9CA3AF', icon: '📄', is_active: true }
    ];

    const allCategories = [...taskCategories, ...calendarCategories, ...documentCategories];

    // Insert categories one by one to handle duplicates gracefully
    const results = [];
    for (const category of allCategories) {
      const { data, error } = await supabase
        .from('categories')
        .upsert(category, { 
          onConflict: 'name,module',
          ignoreDuplicates: true 
        })
        .select()
        .single();
      
      if (data) {
        results.push(data);
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Categories seeded successfully',
      categories: results,
      count: results.length
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
