export function deriveFilePath(fileUrl?: string | null, fallbackFileName?: string | null): string | null {
  if (fileUrl && fileUrl.includes('/file/')) {
    const afterFile = fileUrl.split('/file/')[1];
    if (afterFile) {
      const parts = afterFile.split('/');
      if (parts.length > 1) {
        const rawPath = parts.slice(1).join('/');
        try {
          return decodeURIComponent(rawPath);
        } catch {
          return rawPath;
        }
      }
    }
  }
  if (fallbackFileName) {
    try {
      return decodeURIComponent(fallbackFileName);
    } catch {
      return fallbackFileName;
    }
  }
  return null;
}
