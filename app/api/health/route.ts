import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateEncryptionSetup } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  // Basic health check - always available
  const basicHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };

  // Check if detailed health check is requested
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === 'true';

  if (!detailed) {
    return NextResponse.json(basicHealth);
  }

  // Detailed health check - check for admin auth
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Only allow detailed health check for authenticated admins
    if (!user || userError) {
      return NextResponse.json({
        ...basicHealth,
        error: 'Authentication required for detailed health check'
      }, { status: 401 });
    }

    // Check user role
    const { data: userData, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (roleError || userData?.role !== 'admin') {
      return NextResponse.json({
        ...basicHealth,
        error: 'Admin access required for detailed health check'
      }, { status: 403 });
    }

    // Perform detailed health checks
    const health = {
      ...basicHealth,
      checks: {
        database: { status: 'checking' as 'ok' | 'error', message: '' },
        encryption: { status: 'checking' as 'ok' | 'error', message: '' },
        backblaze: { status: 'checking' as 'ok' | 'error', message: '' },
        google: { status: 'checking' as 'ok' | 'error', message: '' },
        environment: { status: 'checking' as 'ok' | 'error', message: '' },
      }
    };

    // Check database connection
    try {
      const { error } = await supabase
        .from('users')
        .select('count')
        .limit(1)
        .single();
      
      health.checks.database = {
        status: error ? 'error' : 'ok',
        message: error ? error.message : 'Connected'
      };
    } catch (error) {
      health.checks.database = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check encryption setup
    try {
      const encryptionCheck = validateEncryptionSetup();
      health.checks.encryption = {
        status: encryptionCheck.valid ? 'ok' : 'error',
        message: encryptionCheck.error || 'Encryption configured correctly'
      };
    } catch (error) {
      health.checks.encryption = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Encryption check failed'
      };
    }

    // Check Backblaze configuration
    health.checks.backblaze = {
      status: 'ok',
      message: 'Not implemented - would check B2 connection'
    };
    if (process.env.BACKBLAZE_KEY_ID && process.env.BACKBLAZE_BUCKET_ID) {
      health.checks.backblaze.status = 'ok';
      health.checks.backblaze.message = 'Environment variables configured';
    } else {
      health.checks.backblaze.status = 'error';
      health.checks.backblaze.message = 'Missing environment variables';
    }

    // Check Google OAuth configuration
    health.checks.google = {
      status: process.env.GOOGLE_CLIENT_ID ? 'ok' : 'error',
      message: process.env.GOOGLE_CLIENT_ID ? 'OAuth configured' : 'Google OAuth not configured'
    };

    // Check critical environment variables
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ENCRYPTION_KEY',
    ];

    const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
    health.checks.environment = {
      status: missingEnvVars.length === 0 ? 'ok' : 'error',
      message: missingEnvVars.length === 0 
        ? 'All required environment variables set'
        : `Missing: ${missingEnvVars.join(', ')}`
    };

    // Calculate overall health status
    const allChecks = Object.values(health.checks);
    const hasErrors = allChecks.some(check => check.status === 'error');
    const overallStatus = hasErrors ? 'degraded' : 'healthy';

    return NextResponse.json({
      ...health,
      overallStatus,
      version: process.env.npm_package_version || 'unknown',
    });

  } catch (error) {
    return NextResponse.json({
      ...basicHealth,
      status: 'error',
      error: error instanceof Error ? error.message : 'Health check failed'
    }, { status: 500 });
  }
}