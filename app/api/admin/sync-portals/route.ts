import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_helpers/auth';
import { syncExistingDoctorPortals } from '@/lib/services/portal-password-sync';

export async function POST(request: NextRequest) {
  try {
    const adminResult = await requireAdmin(request);
    if ('error' in adminResult) return adminResult.error;
    const { user } = adminResult;

    console.log('[Sync Portals] Starting portal sync for user:', user.id);
    
    const results = await syncExistingDoctorPortals(user.id);
    
    console.log('[Sync Portals] Sync complete:', results);
    
    return NextResponse.json({
      success: true,
      message: `Successfully synced ${results.synced} portals`,
      details: results
    });
    
  } catch (error) {
    console.error('[Sync Portals] Error:', error);
    return NextResponse.json(
      { error: 'Failed to sync portals', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
