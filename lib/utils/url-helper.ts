/**
 * Normalize URL input to ensure it has a proper protocol
 * @param input - User input URL in any format
 * @returns Properly formatted URL with protocol
 */
export function normalizeUrl(input: string): string {
  if (!input) return '';
  
  // Trim whitespace
  let url = input.trim();
  
  // If it's already a valid URL with protocol, return it
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it starts with www, add https://
  if (url.startsWith('www.')) {
    return `https://${url}`;
  }
  
  // For everything else, add https://
  // This handles: anthonynicolau.com, example.com, etc.
  return `https://${url}`;
}

/**
 * Smart URL completion for common domains
 * @param input - User input (can be shorthand)
 * @returns Full URL for known domains or normalized URL
 */
export function smartUrlComplete(input: string): string {
  if (!input) return '';
  
  const lowered = input.toLowerCase().trim();
  
  // Common domains mapping
  const commonDomains: Record<string, string> = {
    'gmail': 'https://mail.google.com',
    'google': 'https://www.google.com',
    'facebook': 'https://www.facebook.com',
    'fb': 'https://www.facebook.com',
    'instagram': 'https://www.instagram.com',
    'ig': 'https://www.instagram.com',
    'twitter': 'https://twitter.com',
    'x': 'https://x.com',
    'amazon': 'https://www.amazon.com',
    'netflix': 'https://www.netflix.com',
    'youtube': 'https://www.youtube.com',
    'yt': 'https://www.youtube.com',
    'linkedin': 'https://www.linkedin.com',
    'github': 'https://github.com',
    'apple': 'https://www.apple.com',
    'icloud': 'https://www.icloud.com',
    'microsoft': 'https://www.microsoft.com',
    'outlook': 'https://outlook.com',
    'paypal': 'https://www.paypal.com',
    'ebay': 'https://www.ebay.com',
    'reddit': 'https://www.reddit.com',
    'discord': 'https://discord.com',
    'slack': 'https://slack.com',
    'zoom': 'https://zoom.us',
    'dropbox': 'https://www.dropbox.com',
    'spotify': 'https://www.spotify.com',
  };
  
  // Check if it's a known shorthand
  if (commonDomains[lowered]) {
    return commonDomains[lowered];
  }
  
  // Otherwise use normal formatting
  return normalizeUrl(input);
}

/**
 * Extract a friendly domain name from a URL for display
 * @param url - Full URL
 * @returns Domain name without protocol or www
 */
export function getFriendlyDomain(url: string): string {
  if (!url) return '';
  
  try {
    // Remove protocol and www
    return url
      .replace(/^https?:\/\/(www\.)?/, '')
      .split('/')[0]
      .split('?')[0];
  } catch {
    return url;
  }
}

// Examples:
// normalizeUrl("anthonynicolau.com") → "https://anthonynicolau.com"
// normalizeUrl("www.anthonynicolau.com") → "https://www.anthonynicolau.com"
// normalizeUrl("https://anthonynicolau.com") → "https://anthonynicolau.com"
// smartUrlComplete("gmail") → "https://mail.google.com"
// getFriendlyDomain("https://www.example.com/path") → "example.com"