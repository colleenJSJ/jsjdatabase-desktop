const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (process.env.SKIP_NOTARIZE === '1') {
    console.log('[notarize] Skipping notarization because SKIP_NOTARIZE=1');
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn('[notarize] Missing Apple notarization credentials; skipping');
    return;
  }

  const appName = packager.appInfo.productFilename;

  await notarize({
    appBundleId: 'com.familyoffice.desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
};
