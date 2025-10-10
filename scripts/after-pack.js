const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const dotenv = require('dotenv');
const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(destPath), { recursive: true });
      await copyFile(srcPath, destPath);
    }
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appContentsPath = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  const standaloneSrc = path.join(packager.projectDir, '.next', 'standalone');
  const standaloneDest = path.join(appContentsPath, 'app.asar.unpacked', '.next', 'standalone');
  const staticSrc = path.join(packager.projectDir, '.next', 'static');
  const staticDest = path.join(appContentsPath, 'app.asar.unpacked', '.next', 'static');

  try {
    await stat(standaloneSrc);
    await copyDir(standaloneSrc, standaloneDest);
  } catch (error) {
    console.warn('[after-pack] No standalone build found to copy:', error.message);
  }

  try {
    await stat(staticSrc);
    await copyDir(staticSrc, staticDest);
  } catch (error) {
    console.warn('[after-pack] No static build found to copy:', error.message);
  }

  const loadEnvFromFile = (filename) => {
    const filePath = path.join(packager.projectDir, filename);
    if (!fs.existsSync(filePath)) {
      return {};
    }
    try {
      return dotenv.parse(fs.readFileSync(filePath));
    } catch (error) {
      console.warn(`[after-pack] Failed to parse ${filename}:`, error.message);
      return {};
    }
  };

  const envFromFiles = {
    ...loadEnvFromFile('.env.production.local'),
    ...loadEnvFromFile('.env.local')
  };

  const getEnvValue = (key) => {
    const current = process.env[key];
    if (current !== undefined && current !== null && current !== '') {
      return current;
    }
    return envFromFiles[key];
  };

  const requiredEnvKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL'
  ];

  const optionalEnvKeys = [
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_CLIENT_SECRET',
    'SECURITY_CSRF_ENFORCE',
    'SECURITY_CSRF_ENABLED',
    'SECURITY_MAX_UPLOAD_MB',
    'ICS_FALLBACK',
    'ICS_UID_DOMAIN'
  ];

  const envLines = [];
  const missingRequiredKeys = [];

  const appendKey = (key, value, required) => {
    if (value === undefined || value === null || value === '') {
      if (required) {
        missingRequiredKeys.push(key);
      }
      return;
    }
    envLines.push(`${key}=${String(value).replace(/\n/g, '\\n')}`);
  };

  requiredEnvKeys.forEach((key) => appendKey(key, getEnvValue(key), true));
  optionalEnvKeys.forEach((key) => appendKey(key, getEnvValue(key), false));

  try {
    if (envLines.length > 0) {
      const envOutputDir = path.join(appContentsPath, 'app.asar.unpacked');
      await fs.promises.mkdir(envOutputDir, { recursive: true });
      const envFilePath = path.join(envOutputDir, '.env');
      await fs.promises.writeFile(envFilePath, `${envLines.join('\n')}\n`, 'utf8');
      console.log('[after-pack] Wrote runtime environment configuration to .env');
    } else {
      console.warn('[after-pack] Skipped writing .env because no environment variables were captured');
    }
  } catch (error) {
    console.error('[after-pack] Failed to write runtime .env file:', error.message);
  }

  if (missingRequiredKeys.length > 0) {
    console.warn('[after-pack] Missing required environment variables (may cause runtime issues):', missingRequiredKeys.join(', '));
  }
};
