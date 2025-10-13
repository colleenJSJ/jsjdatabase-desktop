const REQUIRED_HEX_LENGTH = 64; // 32 bytes
const REQUIRED_KEY_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type NodeCompatibleUint8Array = Uint8Array & { buffer: ArrayBuffer };

function toBufferSource(value: Uint8Array | ArrayBuffer): ArrayBuffer | ArrayBufferView {
  if (value instanceof Uint8Array) {
    const nodeValue = value as Partial<NodeCompatibleUint8Array>;
    if (nodeValue.buffer instanceof ArrayBuffer) {
      return nodeValue.buffer;
    }
    return value.buffer;
  }
  return value;
}

let cachedKey: CryptoKey | null = null;

function getRawEncryptionKey(): string {
  const key =
    process.env.EDGE_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }

  if (!/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be hexadecimal');
  }

  if (key.length !== REQUIRED_HEX_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${REQUIRED_HEX_LENGTH} hex characters`);
  }

  return key;
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const rawKey = hexToUint8Array(getRawEncryptionKey());
  if (rawKey.length !== REQUIRED_KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${REQUIRED_KEY_BYTES} bytes`);
  }

  cachedKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(rawKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return cachedKey;
}

export async function encryptText(plainText: string): Promise<string> {
  if (typeof plainText !== 'string') {
    throw new TypeError('encryptText expects a string');
  }

  if (plainText.length === 0) {
    return '';
  }

  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = encoder.encode(plainText);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  if (encryptedBytes.length <= 16) {
    throw new Error('Encrypted payload too short to contain auth tag');
  }

  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);

  const ivHex = uint8ArrayToHex(iv);
  const authTagHex = uint8ArrayToHex(authTag);
  const cipherHex = uint8ArrayToHex(cipherBytes);

  return `${ivHex}:${authTagHex}:${cipherHex}`;
}

export async function decryptText(payload: string): Promise<string> {
  if (typeof payload !== 'string') {
    throw new TypeError('decryptText expects a string');
  }

  if (!payload) {
    return '';
  }

  const tryBase64 = (value: string): string => {
    try {
      return Buffer.from(value, 'base64').toString('utf8');
    } catch {
      return value;
    }
  };

  if (!payload.includes(':')) {
    return tryBase64(payload);
  }

  const [ivHex, authTagHex, cipherHex] = payload.split(':');
  if (!ivHex || !authTagHex || !cipherHex) {
    return tryBase64(payload);
  }

  try {
    const key = await getCryptoKey();
    const iv = hexToUint8Array(ivHex);
    const authTag = hexToUint8Array(authTagHex);
    const cipherBytes = hexToUint8Array(cipherHex);

    const combined = new Uint8Array(cipherBytes.length + authTag.length);
    combined.set(cipherBytes);
    combined.set(authTag, cipherBytes.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined,
    );

    return decoder.decode(decryptedBuffer);
  } catch {
    return tryBase64(payload);
  }
}

export async function healthCheck(): Promise<boolean> {
  const test = 'test_encryption_validation';
  const ciphertext = await encryptText(test);
  const plaintext = await decryptText(ciphertext);
  return plaintext === test;
}
