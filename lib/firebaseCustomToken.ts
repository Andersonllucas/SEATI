import crypto from 'node:crypto';

export interface ServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
  projectId?: string;
  privateKeyId?: string;
}

// Chaves revogadas no Google Cloud IAM conhecidas para evitar erros de assinatura JWT
const REVOKED_KEY_IDS = new Set(['7986d0d453c37b8d8ecdc38bd865ec3394ddc587']);
const REVOKED_KEY_SNIPPET = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC';

/**
 * Converte Buffer ou string para Base64 URL-safe (sem padding '=')
 */
function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Obtém as credenciais da Service Account do Firebase Central exclusivamente a partir das variáveis de ambiente.
 * Retorna null se não estiverem configuradas ou se a chave for revogada.
 */
export function getServiceAccountCredentials(): ServiceAccountConfig | null {
  // 1. Tenta carregar JSON completo via variável de ambiente (JSON puro ou Base64)
  const rawKeyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawKeyJson && rawKeyJson.trim()) {
    let cleanJson = rawKeyJson.trim();
    // Suporte a valor codificado em Base64 (comum em Cloudflare/Vercel secrets)
    if (!cleanJson.startsWith('{') && cleanJson.length > 50) {
      try {
        const decoded = Buffer.from(cleanJson, 'base64').toString('utf8');
        if (decoded.trim().startsWith('{')) {
          cleanJson = decoded.trim();
        }
      } catch {}
    }

    if (cleanJson.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanJson);
        // Se a chave estiver revogada no Google Cloud, desconsidera
        if (parsed.private_key_id && REVOKED_KEY_IDS.has(parsed.private_key_id)) {
          return null;
        }
        if (parsed.private_key && parsed.private_key.includes(REVOKED_KEY_SNIPPET)) {
          return null;
        }
        if (parsed.client_email && parsed.private_key) {
          return {
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key,
            projectId: parsed.project_id,
            privateKeyId: parsed.private_key_id
          };
        }
      } catch {
        // Fallback silencioso para variáveis individuais
      }
    }
  }

  // 2. Tenta carregar variáveis individuais
  const rawEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (rawEmail && rawKey) {
    let cleanEmail = rawEmail.trim();
    if ((cleanEmail.startsWith('"') && cleanEmail.endsWith('"')) || (cleanEmail.startsWith("'") && cleanEmail.endsWith("'"))) {
      cleanEmail = cleanEmail.slice(1, -1).trim();
    }
    let cleanKey = rawKey.trim();
    if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
      cleanKey = cleanKey.slice(1, -1).trim();
    }
    // Suporte a chave privada codificada em Base64 para evitar problemas com quebras de linha em formulários
    if (!cleanKey.includes('-----BEGIN') && cleanKey.length > 50) {
      try {
        const decoded = Buffer.from(cleanKey, 'base64').toString('utf8');
        if (decoded.includes('-----BEGIN')) {
          cleanKey = decoded;
        }
      } catch {}
    }
    // Se a chave for a revogada, desconsidera
    if (cleanKey.includes(REVOKED_KEY_SNIPPET)) {
      return null;
    }
    return {
      clientEmail: cleanEmail,
      privateKey: cleanKey
    };
  }

  return null;
}

export interface CustomTokenClaims {
  perfil?: string;
  email?: string;
  nome?: string;
  [key: string]: any;
}

/**
 * Gera um Firebase Custom Token (JWT assinado com RS256) diretamente,
 * em estrita conformidade com a especificação do Google Identity Toolkit.
 * Compatível nativamente tanto com Node.js quanto com Cloudflare Workers (nodejs_compat).
 */
export function createFirebaseCustomToken(
  uid: string,
  claims: CustomTokenClaims = {},
  credentialsOverride?: ServiceAccountConfig
): string {
  const creds = credentialsOverride || getServiceAccountCredentials();

  if (!creds || !creds.clientEmail || !creds.privateKey) {
    throw new Error(
      'Service Account do Firebase não configurada. Defina FIREBASE_SERVICE_ACCOUNT_KEY nas variáveis de ambiente.'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    iss: creds.clientEmail,
    sub: creds.clientEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600, // Validade de 1 hora
    uid: uid,
    claims: claims
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const messageToSign = `${encodedHeader}.${encodedPayload}`;

  // Formata a chave privada (converte \n literais para quebras de linha reais se necessário)
  const formattedPrivateKey = creds.privateKey.includes('\\n')
    ? creds.privateKey.replace(/\\n/g, '\n')
    : creds.privateKey;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(messageToSign);
  const signature = signer.sign(formattedPrivateKey);
  const encodedSignature = base64UrlEncode(signature);

  return `${messageToSign}.${encodedSignature}`;
}
