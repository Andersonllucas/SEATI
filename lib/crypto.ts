/**
 * Módulo Criptográfico de Segurança (Web Cryptography API)
 * Utiliza PBKDF2 com HMAC-SHA256, Salt Criptográfico Único e 100.000 iterações (Padrão OWASP).
 * Protege todas as senhas armazenadas no banco de dados contra ataques de dicionário e rainbow tables.
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTE_LENGTH = 16;
const HASH_ALGORITHM = 'SHA-256';

/**
 * Converte ArrayBuffer para string hexadecimal
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converte string hexadecimal para Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, (i + 1) * 2), 16);
  }
  return bytes;
}

/**
 * Comparação em tempo constante para prevenir timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Obtém a instância de Web Cryptography
 */
function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Web Cryptography API não disponível no ambiente atual.');
}

/**
 * Verifica se uma senha já está criptografada com PBKDF2
 */
export function isHashedPassword(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('pbkdf2:sha256:');
}

/**
 * Gera o Hash criptográfico com Salt aleatório para uma senha
 * Formato retornado: `pbkdf2:sha256:{iterations}:{saltHex}:{hashHex}`
 */
export async function hashPassword(password: string): Promise<string> {
  const cryptoInstance = getCrypto();

  // 1. Gera salt criptograficamente seguro e único
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  cryptoInstance.getRandomValues(salt);
  const saltHex = bufferToHex(salt.buffer);

  // 2. Importa a senha como chave base
  const enc = new TextEncoder();
  const keyMaterial = await cryptoInstance.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // 3. Deriva os bits com PBKDF2-HMAC-SHA256
  const derivedBits = await cryptoInstance.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM
    },
    keyMaterial,
    256
  );

  const hashHex = bufferToHex(derivedBits);
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Valida se uma senha informada corresponde ao hash com salt armazenado.
 * Possui compatibilidade retroativa com senhas legadas em texto simples.
 */
export async function verifyPassword(password: string, storedHashOrPlain?: string | null): Promise<boolean> {
  if (!storedHashOrPlain) return false;

  // Se for uma senha legada em texto simples (para migração suave)
  if (!isHashedPassword(storedHashOrPlain)) {
    return constantTimeCompare(password, storedHashOrPlain);
  }

  try {
    const parts = storedHashOrPlain.split(':');
    if (parts.length !== 5) return false;

    const [, , iterStr, saltHex, expectedHash] = parts;
    const iterations = parseInt(iterStr, 10) || PBKDF2_ITERATIONS;
    const salt = hexToBuffer(saltHex);

    const cryptoInstance = getCrypto();
    const enc = new TextEncoder();

    const keyMaterial = await cryptoInstance.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await cryptoInstance.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: iterations,
        hash: HASH_ALGORITHM
      },
      keyMaterial,
      256
    );

    const computedHash = bufferToHex(derivedBits);
    return constantTimeCompare(computedHash, expectedHash);
  } catch (err) {
    console.error('Erro na validação criptográfica de senha:', err);
    return false;
  }
}
