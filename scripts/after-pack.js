const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
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
};
