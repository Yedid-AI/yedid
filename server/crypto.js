import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) return null
  // Key must be 32 bytes (64 hex chars)
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a plaintext string. Returns base64-encoded "iv:encrypted:tag".
 * If ENCRYPTION_KEY is not set, returns plaintext unchanged (graceful degradation).
 */
export function encrypt(plaintext) {
  if (!plaintext) return plaintext
  const key = getKey()
  if (!key) return plaintext

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${encrypted}:${tag.toString('base64')}`
}

/**
 * Decrypt an encrypted string. Returns plaintext.
 * If input doesn't look encrypted (no colons), returns as-is (backward compat).
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext
  const key = getKey()
  if (!key) return ciphertext
  // Not encrypted (legacy plaintext) — return as-is
  if (!ciphertext.includes(':')) return ciphertext

  try {
    const [ivB64, encB64, tagB64] = ciphertext.split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    let decrypted = decipher.update(encB64, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    // Decryption failed — likely legacy plaintext with colons or wrong key
    return ciphertext
  }
}
