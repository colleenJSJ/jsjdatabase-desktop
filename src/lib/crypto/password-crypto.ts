// Simple client-side encryption for passwords
// In production, use proper encryption libraries and consider Bitwarden API

const ENCRYPTION_KEY = 'johnson-family-office-temp-key'; // In production, use proper key management

export const passwordCrypto = {
  // Simple base64 encoding for demo purposes
  // In production, use proper encryption like AES-256
  encrypt: (text: string): string => {
    try {
      // For demo: just base64 encode
      return btoa(text);
    } catch (error) {

      return text;
    }
  },

  decrypt: (encryptedText: string): string => {
    try {
      // Check if it's already plain text or needs decryption
      if (!encryptedText || encryptedText === '') return '';
      
      // Validate base64 before decoding
      // Base64 regex pattern
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      
      if (!base64Regex.test(encryptedText)) {
        // Not base64 encoded, return as-is
        console.warn('Password appears to be plain text, returning as-is');
        return encryptedText;
      }
      
      // Additional check: base64 strings must have length divisible by 4
      if (encryptedText.length % 4 !== 0) {
        console.warn('Invalid base64 string length, returning as-is');
        return encryptedText;
      }
      
      // Try to decode
      return atob(encryptedText);
    } catch (error) {

      // Return original text if decryption fails
      return encryptedText;
    }
  },

  // Generate a random password
  generatePassword: (length: number = 16): string => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  },
};