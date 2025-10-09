import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PasswordMigrationService } from '@/lib/services/password-migration';

const migrationService = new PasswordMigrationService();

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'json';

    // Log export attempt
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'password_export_attempted',
          metadata: { format }
        }),
      }).catch(() => undefined);
    } catch (error) {
      console.error('Failed to log export activity:', error);
    }

    if (format === 'csv') {
      const csv = await migrationService.exportToCSV(user.id);
      
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="passwords_export_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    } else {
      const json = await migrationService.exportToJSON(user.id);
      
      return new NextResponse(JSON.stringify(json, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="passwords_export_${new Date().toISOString().split('T')[0]}.json"`
        }
      });
    }
  } catch (error) {
    console.error('[API/passwords/export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export passwords' },
      { status: 500 }
    );
  }
}