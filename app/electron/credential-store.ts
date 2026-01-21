/**
 * Secure credential storage using AES-256-GCM encryption
 * Credentials are encrypted using a machine-specific key derived from username
 */
import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'task-center-jira-v1';

// Derive encryption key from machine-specific data
function deriveKey(): Buffer {
  const machineId = `${os.userInfo().username}-${os.hostname()}-${os.platform()}`;
  return crypto.scryptSync(machineId, SALT, KEY_LENGTH);
}

/**
 * Encrypt sensitive data
 * @param plaintext - Data to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (hex encoded)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 * @param encrypted - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext or empty string on error
 */
export function decrypt(encrypted: string): string {
  if (!encrypted || !encrypted.includes(':')) return '';

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return '';

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];

    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Check if a string is encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 &&
         parts[0].length === IV_LENGTH * 2 &&
         parts[1].length === AUTH_TAG_LENGTH * 2;
}

// Credential storage interface
interface StoredCredentials {
  username?: string;
  password?: string;
  encrypted: boolean;
  version: number;
}

const CREDENTIALS_FILE = path.join(
  process.env.USERPROFILE || '',
  'Task_Center',
  'data',
  '.credentials'
);

/**
 * Save credentials securely
 */
export function saveCredentials(username: string, password: string): boolean {
  try {
    const dir = path.dirname(CREDENTIALS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const credentials: StoredCredentials = {
      username: encrypt(username),
      password: encrypt(password),
      encrypted: true,
      version: 1
    };

    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
      encoding: 'utf-8',
      mode: 0o600 // Owner read/write only
    });

    return true;
  } catch (error) {
    console.error('Failed to save credentials:', error);
    return false;
  }
}

/**
 * Load credentials
 */
export function loadCredentials(): { username: string; password: string } | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const credentials: StoredCredentials = JSON.parse(content);

    if (!credentials.encrypted) {
      // Legacy unencrypted credentials - migrate
      return {
        username: credentials.username || '',
        password: credentials.password || ''
      };
    }

    return {
      username: decrypt(credentials.username || ''),
      password: decrypt(credentials.password || '')
    };
  } catch (error) {
    console.error('Failed to load credentials:', error);
    return null;
  }
}

/**
 * Delete stored credentials
 */
export function deleteCredentials(): boolean {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete credentials:', error);
    return false;
  }
}

/**
 * Check if credentials are stored
 */
export function hasCredentials(): boolean {
  return fs.existsSync(CREDENTIALS_FILE);
}
