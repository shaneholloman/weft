/**
 * Encryption utilities using Web Crypto API
 *
 * Uses AES-256-GCM for authenticated encryption.
 * Key is derived from ENCRYPTION_KEY environment variable.
 */

/**
 * Encrypt a string value using AES-GCM
 * Returns base64-encoded string containing IV + ciphertext
 */
export async function encryptValue(value: string, encryptionKey: string): Promise<string> {
  const key = await deriveKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt a base64-encoded encrypted value
 */
export async function decryptValue(encrypted: string, encryptionKey: string): Promise<string> {
  const key = await deriveKey(encryptionKey);
  const combined = base64ToArrayBuffer(encrypted);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Derive an AES-256 key from the encryption key string
 * Uses PBKDF2 for key derivation
 */
async function deriveKey(keyString: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyString),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Use a fixed salt - in production you might want a per-deployment salt
  const salt = new TextEncoder().encode('weft-credential-encryption-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert Uint8Array to base64 string
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

