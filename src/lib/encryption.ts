import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const REQUIRED_KEY_LENGTH = 32; // 32 bytes for AES-256
const REQUIRED_HEX_LENGTH = 64; // 64 hex characters = 32 bytes

// Validate encryption key on module initialization
const validateEncryptionKey = (key: string): void => {
  // Check if key is provided
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not configured');
  }
  
  // Check if key is valid hex
  if (!/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a hexadecimal string (only 0-9, a-f, A-F characters allowed)');
  }
  
  // Check key length
  if (key.length !== REQUIRED_HEX_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${REQUIRED_HEX_LENGTH} hexadecimal characters (${REQUIRED_KEY_LENGTH} bytes) for AES-256. ` +
      `Current length: ${key.length} characters`
    );
  }
};

// Cache the validated key buffer
let cachedKeyBuffer: Buffer | null = null;

// Use environment variable for the key
const getKey = () => {
  if (cachedKeyBuffer) {
    return cachedKeyBuffer;
  }
  
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  
  // Validate the key
  validateEncryptionKey(key);
  
  // Convert to buffer and cache
  cachedKeyBuffer = Buffer.from(key, 'hex');
  
  // Final validation that the buffer is the correct length
  if (cachedKeyBuffer.length !== REQUIRED_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY buffer is ${cachedKeyBuffer.length} bytes, but must be ${REQUIRED_KEY_LENGTH} bytes for AES-256`
    );
  }
  
  return cachedKeyBuffer;
};

export const encryptionService = {
  encrypt: (text: string): string => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv:authTag:encrypted into a single string
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  },
  
  decrypt: (encryptedData: string): string => {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    
    const decipher = crypto.createDecipheriv(
      algorithm,
      getKey(),
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
};

// Legacy functions for backward compatibility during migration
export function encrypt(text: string): string {
  return encryptionService.encrypt(text);
}

export function decrypt(text: string): string {
  return encryptionService.decrypt(text);
}

// Function to validate encryption key at startup
// Call this early in your application initialization
export function validateEncryptionSetup(): { valid: boolean; error?: string } {
  try {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      return { 
        valid: false, 
        error: 'ENCRYPTION_KEY environment variable is not set' 
      };
    }
    
    validateEncryptionKey(key);
    
    // Try to get the key buffer to ensure full validation
    getKey();
    
    // Try a test encryption/decryption
    const testString = 'test_encryption_validation';
    const encrypted = encryptionService.encrypt(testString);
    const decrypted = encryptionService.decrypt(encrypted);
    
    if (decrypted !== testString) {
      return { 
        valid: false, 
        error: 'Encryption/decryption test failed' 
      };
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error validating encryption setup' 
    };
  }
}