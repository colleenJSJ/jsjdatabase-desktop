export function detectDevice(userAgent: string): {
  type: 'web' | 'mobile-web' | 'pwa';
  browser?: string;
  os?: string;
  isMobile: boolean;
} {
  const ua = userAgent.toLowerCase();
  
  // Detect if PWA
  const isPWA = typeof window !== 'undefined' && 
    (window.matchMedia('(display-mode: standalone)').matches ||
     (window.navigator as any).standalone === true);

  // Detect mobile
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return {
    type: isPWA ? 'pwa' : isMobile ? 'mobile-web' : 'web',
    browser,
    os,
    isMobile,
  };
}

export function generateDeviceName(deviceInfo: ReturnType<typeof detectDevice>): string {
  const parts = [];
  
  if (deviceInfo.browser !== 'Unknown') {
    parts.push(deviceInfo.browser);
  }
  
  if (deviceInfo.os !== 'Unknown') {
    parts.push(`on ${deviceInfo.os}`);
  }
  
  if (parts.length === 0) {
    return deviceInfo.type === 'pwa' ? 'Mobile App' : 'Web Browser';
  }
  
  return parts.join(' ');
}

// Check if the app is installed as PWA
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://') ||
    window.location.search.includes('mode=standalone')
  );
}

// Get device fingerprint (basic implementation)
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server';
  
  const factors = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
  ];
  
  // Simple hash function
  const hash = factors.join('|');
  
  // In production, use a proper fingerprinting library like FingerprintJS
  return btoa(hash).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}