export type PasswordStrength = 'weak' | 'medium' | 'strong';

/**
 * Rough heuristic for password strength based on length and character variety.
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak';

  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const isLongEnough = password.length >= 12;

  const criteriaMet = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChar, isLongEnough]
    .filter(Boolean).length;

  if (criteriaMet >= 4) return 'strong';
  if (criteriaMet >= 3) return 'medium';
  return 'weak';
}

export function getPasswordAgeDays(lastChanged?: string | null): number | null {
  if (!lastChanged) return null;
  const changedDate = new Date(lastChanged);
  if (Number.isNaN(changedDate.getTime())) return null;
  const diffMs = Date.now() - changedDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
