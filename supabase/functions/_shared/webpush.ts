// Minimal Web Push (RFC 8292 VAPID + RFC 8291 payload encryption) for Deno.
// No external dependencies — uses only Web Crypto API.

const encoder = new TextEncoder();

function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}

function b64uEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── VAPID JWT ────────────────────────────────────────────────────────────────

async function vapidJWT(audience: string, subject: string, privateKeyB64u: string): Promise<string> {
  const header = b64uEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64uEncode(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  })));
  const sigInput = `${header}.${payload}`;

  const pkcs8 = b64uDecode(privateKeyB64u);
  const key = await crypto.subtle.importKey(
    'pkcs8', pkcs8.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key, encoder.encode(sigInput)
  );
  return `${sigInput}.${b64uEncode(sig)}`;
}

// ─── Payload encryption (RFC 8291) ───────────────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhB64u: string,
  authB64u: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const receiverPublicKey = await crypto.subtle.importKey(
    'raw', b64uDecode(p256dhB64u).buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveKey', 'deriveBits']
  );
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPublicKey },
    serverKeyPair.privateKey, 256
  );

  const authSecret = b64uDecode(authB64u);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for content encryption key and nonce (RFC 8291)
  const prk = await hkdf(authSecret, new Uint8Array(sharedBits), buildInfo('auth'), 32);
  const cek = await hkdf(salt, prk, buildKeyInfo(serverPublicKeyRaw, b64uDecode(p256dhB64u)), 16);
  const nonce = await hkdf(salt, prk, buildNonceInfo(serverPublicKeyRaw, b64uDecode(p256dhB64u)), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const data = encoder.encode(plaintext);
  const padded = new Uint8Array(data.length + 2);
  padded.set(data); // 2 byte padding delimiter already zeroed
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

function buildInfo(type: string): Uint8Array {
  return encoder.encode(`Content-Encoding: ${type}\0`);
}

function buildKeyInfo(serverKey: Uint8Array, receiverKey: Uint8Array): Uint8Array {
  const label = encoder.encode('Content-Encoding: aesgcm\0P-256\0');
  const out = new Uint8Array(label.length + 2 + receiverKey.length + 2 + serverKey.length);
  let off = 0;
  out.set(label, off); off += label.length;
  new DataView(out.buffer).setUint16(off, receiverKey.length, false); off += 2;
  out.set(receiverKey, off); off += receiverKey.length;
  new DataView(out.buffer).setUint16(off, serverKey.length, false); off += 2;
  out.set(serverKey, off);
  return out;
}

function buildNonceInfo(serverKey: Uint8Array, receiverKey: Uint8Array): Uint8Array {
  const label = encoder.encode('Content-Encoding: nonce\0P-256\0');
  const out = new Uint8Array(label.length + 2 + receiverKey.length + 2 + serverKey.length);
  let off = 0;
  out.set(label, off); off += label.length;
  new DataView(out.buffer).setUint16(off, receiverKey.length, false); off += 2;
  out.set(receiverKey, off); off += receiverKey.length;
  new DataView(out.buffer).setUint16(off, serverKey.length, false); off += 2;
  out.set(serverKey, off);
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', key, salt));
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const block = new Uint8Array(info.length + 1);
  block.set(info);
  block[info.length] = 1;
  const result = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, block));
  return result.slice(0, length);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
}

export async function sendWebPush(
  sub: PushSub,
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await vapidJWT(audience, vapidSubject, vapidPrivateKey);

  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    JSON.stringify(payload), sub.p256dh, sub.auth
  );

  // Build encrypted body with salt header (RFC 8291 §3)
  // rs = record size (4096), idlen = 65 (uncompressed P-256 point)
  const body = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.length);
  let off = 0;
  body.set(salt, off); off += 16;
  new DataView(body.buffer).setUint32(off, 4096, false); off += 4;
  body[off++] = 65;
  body.set(serverPublicKey, off); off += 65;
  body.set(ciphertext, off);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${b64uEncode(salt.buffer)}`,
      'Crypto-Key': `dh=${b64uEncode(serverPublicKey.buffer)}`,
      'TTL': '86400',
    },
    body,
  });

  return { ok: res.ok, status: res.status };
}
