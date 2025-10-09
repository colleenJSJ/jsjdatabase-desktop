const ENCRYPTION_ENDPOINT = '/api/encryption';

async function invokeEncryptionEndpoint(payload: Record<string, unknown>) {
  const response = await fetch(ENCRYPTION_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Encryption API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export const passwordCrypto = {
  encrypt: async (text: string): Promise<string> => {
    try {
      if (!text) {
        return '';
      }
      const result = await invokeEncryptionEndpoint({ action: 'encrypt', text });
      const ciphertext = result.ciphertext;
      if (typeof ciphertext !== 'string') {
        throw new Error('Encryption API returned invalid ciphertext');
      }
      return ciphertext;
    } catch (error) {
      console.error('[passwordCrypto] Failed to encrypt text', error);
      return text;
    }
  },

  decrypt: async (encryptedText: string): Promise<string> => {
    try {
      if (!encryptedText) {
        return '';
      }
      const result = await invokeEncryptionEndpoint({ action: 'decrypt', payload: encryptedText });
      const plaintext = result.plaintext;
      if (typeof plaintext !== 'string') {
        throw new Error('Encryption API returned invalid plaintext');
      }
      return plaintext;
    } catch (error) {
      console.error('[passwordCrypto] Failed to decrypt text', error);
      return encryptedText;
    }
  },

  generatePassword: (length: number = 16): string => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  },
};
