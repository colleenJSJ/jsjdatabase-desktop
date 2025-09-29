export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  // Trim whitespace
  url = url.trim();
  
  // If it's already a full URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it starts with www., add https://
  if (url.startsWith('www.')) {
    return `https://${url}`;
  }
  
  // Otherwise, assume it's a domain and add https://
  return `https://${url}`;
}

export function isValidUrl(url: string): boolean {
  if (!url) return true; // Empty is valid (optional field)
  
  try {
    // Try to construct a URL object
    new URL(normalizeUrl(url));
    return true;
  } catch {
    return false;
  }
}