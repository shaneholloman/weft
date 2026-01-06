/**
 * Secure OAuth state encoding/decoding with HMAC signature
 *
 * Uses HMAC-SHA256 to sign the state, preventing tampering.
 * The state includes a timestamp to prevent replay attacks.
 */

interface OAuthStatePayload {
  boardId: string;
  nonce: string;
  timestamp: number;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Sign and encode OAuth state
 */
export async function encodeOAuthState(
  payload: { boardId: string; nonce: string },
  secretKey: string
): Promise<string> {
  const statePayload: OAuthStatePayload = {
    ...payload,
    timestamp: Date.now(),
  };

  const payloadJson = JSON.stringify(statePayload);
  const payloadBase64 = btoa(payloadJson);

  // Create HMAC signature
  const signature = await createHmacSignature(payloadBase64, secretKey);

  // Combine payload and signature
  return `${payloadBase64}.${signature}`;
}

/**
 * Decode and verify OAuth state
 * Returns null if signature is invalid or state has expired
 */
export async function decodeOAuthState(
  encodedState: string,
  secretKey: string
): Promise<OAuthStatePayload | null> {
  const parts = encodedState.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;

  // Verify signature
  const expectedSignature = await createHmacSignature(payloadBase64, secretKey);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  // Decode payload
  try {
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson) as OAuthStatePayload;

    // Check timestamp (prevent replay attacks)
    const age = Date.now() - payload.timestamp;
    if (age > STATE_MAX_AGE_MS || age < 0) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Create HMAC-SHA256 signature
 */
async function createHmacSignature(data: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const dataBuffer = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  const signatureArray = new Uint8Array(signatureBuffer);

  // Convert to base64url (URL-safe base64)
  return btoa(String.fromCharCode(...signatureArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
