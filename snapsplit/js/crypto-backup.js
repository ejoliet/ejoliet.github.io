// SnapSplit — encrypted local backup using the Web Crypto API (AES-GCM,
// PBKDF2-derived key from a user passphrase). Backups never leave the device
// unless the user explicitly exports/shares the resulting file themselves.
'use strict';

const CryptoBackup = (() => {
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const PBKDF2_ITERATIONS = 210000;

  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(passphrase, plainObject) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(passphrase, salt);
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(plainObject));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return {
      v: 1,
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      ciphertext: bufToB64(new Uint8Array(cipherBuf)),
    };
  }

  async function decrypt(passphrase, envelope) {
    const salt = b64ToBuf(envelope.salt);
    const iv = b64ToBuf(envelope.iv);
    const key = await deriveKey(passphrase, salt);
    const cipherBuf = b64ToBuf(envelope.ciphertext);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBuf));
  }

  function bufToB64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  return { encrypt, decrypt };
})();
