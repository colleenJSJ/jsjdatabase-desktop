export const securityConfig = {
  // Allow test and debug routes in production if true
  ALLOW_TEST_ROUTES: (process.env.SECURITY_ALLOW_TEST_ROUTES || 'false').toLowerCase() === 'true',

  // CSRF
  CSRF_ENABLED: (process.env.SECURITY_CSRF_ENABLED || 'false').toLowerCase() === 'true',
  CSRF_ENFORCE: (process.env.SECURITY_CSRF_ENFORCE || 'false').toLowerCase() === 'true', // if false, report-only

  // Upload limits (MB)
  MAX_UPLOAD_MB: parseInt(process.env.SECURITY_MAX_UPLOAD_MB || '10', 10),

  // Logging
  LOG_LEVEL: (process.env.SECURITY_LOG_LEVEL || 'info').toLowerCase(),
};

