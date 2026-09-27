import { getServiceAccountCredentials } from './firebaseCustomToken';
import { CENTRAL_FIREBASE_CONFIG } from './centralFirebaseConfig';

export interface FirestoreRestConfig {
  projectId: string;
  apiKey?: string;
  databaseId?: string;
}

// Converte valores nativos do Firestore REST em objetos JavaScript planos
export function parseFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const id = doc.name ? doc.name.split('/').pop() : '';
  const data: any = { id };

  function parseVal(v: any): any {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue' in v) return parseFloat(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('mapValue' in v) {
      const res: any = {};
      for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
        res[k] = parseVal(val);
      }
      return res;
    }
    if ('arrayValue' in v) {
      return (v.arrayValue.values || []).map(parseVal);
    }
    return null;
  }

  for (const [k, v] of Object.entries(doc.fields)) {
    data[k] = parseVal(v);
  }
  return data;
}

// Converte objetos JavaScript planos para campos tipados do Firestore REST
export function toFirestoreFields(obj: any): any {
  const fields: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) {
      fields[key] = { nullValue: null };
    } else if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (val instanceof Date) {
      fields[key] = { timestampValue: val.toISOString() };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((item) => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return Number.isInteger(item) ? { integerValue: item.toString() } : { doubleValue: item };
            if (typeof item === 'boolean') return { booleanValue: item };
            if (item instanceof Date) return { timestampValue: item.toISOString() };
            if (item && typeof item === 'object') return { mapValue: { fields: toFirestoreFields(item) } };
            return { nullValue: null };
          })
        }
      };
    } else if (typeof val === 'object') {
      fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
    }
  }
  return fields;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let lastFailedAttemptTime = 0;
const FAILED_RETRY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora de cooldown se a chave falhar

// Obtém token de acesso OAuth2 usando a Service Account para operações com permissão de administrador
export async function getServiceAccountAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  // Se a tentativa anterior falhou (ex: chave revogada no Google Cloud), opera direto via API Key
  if (lastFailedAttemptTime > 0 && Date.now() - lastFailedAttemptTime < FAILED_RETRY_COOLDOWN_MS) {
    return null;
  }

  const sa = getServiceAccountCredentials();
  if (!sa || !sa.clientEmail || !sa.privateKey) {
    return null;
  }

  try {
    const crypto = await import('node:crypto');
    const header: Record<string, string> = { alg: 'RS256', typ: 'JWT' };
    if (sa.privateKeyId) {
      header.kid = sa.privateKeyId;
    }
    const payload = {
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    function b64url(str: string | Buffer): string {
      const buf = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
      return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }

    const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const privateKey = sa.privateKey.includes('\\n')
      ? sa.privateKey.replace(/\\n/g, '\n')
      : sa.privateKey;
    const sig = b64url(signer.sign(privateKey));
    const jwt = `${unsigned}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });

    if (!res.ok) {
      lastFailedAttemptTime = Date.now();
      const errText = await res.text().catch(() => '');
      if (errText.includes('invalid_grant') || errText.includes('Invalid JWT Signature')) {
        console.info('[firestoreRest] Service Account não ativa ou revogada; operando via Firestore REST com chave de API.');
      } else {
        console.warn('[firestoreRest] Aviso ao solicitar token OAuth2 de Service Account:', errText);
      }
      return null;
    }

    const data = await res.json();
    if (data.access_token) {
      lastFailedAttemptTime = 0;
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in || 3600)
      };
      return data.access_token;
    }
  } catch (err) {
    lastFailedAttemptTime = Date.now();
    console.warn('[firestoreRest] Erro ao autenticar Service Account:', err);
  }

  return null;
}

function getBaseHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function resolveConfig(config?: FirestoreRestConfig): FirestoreRestConfig {
  return {
    projectId: config?.projectId || CENTRAL_FIREBASE_CONFIG.projectId,
    apiKey: config?.apiKey || CENTRAL_FIREBASE_CONFIG.apiKey,
    databaseId: config?.databaseId || CENTRAL_FIREBASE_CONFIG.firestoreDatabaseId || '(default)'
  };
}

/**
 * Consulta documentos no Firestore REST usando runQuery (compatível 100% com Cloudflare Workers e Node.js)
 */
export async function queryFirestoreRest(
  collectionId: string,
  fieldFilter?: { field: string; op: 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN'; value: string | number | boolean },
  limitCount: number = 50,
  cfg?: FirestoreRestConfig
): Promise<any[]> {
  const c = resolveConfig(cfg);
  const token = await getServiceAccountAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/${c.databaseId}/documents:runQuery${
    !token && c.apiKey ? `?key=${c.apiKey}` : ''
  }`;

  const structuredQuery: any = {
    from: [{ collectionId }]
  };

  if (fieldFilter) {
    let valueField: any = {};
    if (typeof fieldFilter.value === 'string') valueField = { stringValue: fieldFilter.value };
    else if (typeof fieldFilter.value === 'number') {
      valueField = Number.isInteger(fieldFilter.value)
        ? { integerValue: fieldFilter.value.toString() }
        : { doubleValue: fieldFilter.value };
    } else if (typeof fieldFilter.value === 'boolean') {
      valueField = { booleanValue: fieldFilter.value };
    }

    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: fieldFilter.field },
        op: fieldFilter.op,
        value: valueField
      }
    };
  }

  if (limitCount > 0) {
    structuredQuery.limit = limitCount;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: getBaseHeaders(token),
    body: JSON.stringify({ structuredQuery })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[firestoreRest] Query em ${collectionId} falhou (status ${res.status}):`, errText);
    return [];
  }

  const results = await res.json();
  if (!Array.isArray(results)) return [];

  const documents: any[] = [];
  for (const item of results) {
    if (item.document) {
      const parsed = parseFirestoreDoc(item.document);
      if (parsed) documents.push(parsed);
    }
  }
  return documents;
}

/**
 * Busca um único documento pelo ID
 */
export async function getDocRest(
  collectionId: string,
  docId: string,
  cfg?: FirestoreRestConfig
): Promise<any | null> {
  const c = resolveConfig(cfg);
  const token = await getServiceAccountAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/${c.databaseId}/documents/${collectionId}/${encodeURIComponent(docId)}${
    !token && c.apiKey ? `?key=${c.apiKey}` : ''
  }`;

  const res = await fetch(url, {
    method: 'GET',
    headers: getBaseHeaders(token)
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[firestoreRest] getDoc em ${collectionId}/${docId} falhou (status ${res.status}):`, errText);
    return null;
  }

  const data = await res.json();
  return parseFirestoreDoc(data);
}

/**
 * Cria ou atualiza um documento no Firestore via REST
 */
export async function setDocRest(
  collectionId: string,
  docId: string,
  data: Record<string, any>,
  cfg?: FirestoreRestConfig
): Promise<boolean> {
  const c = resolveConfig(cfg);
  const token = await getServiceAccountAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/${c.databaseId}/documents/${collectionId}/${encodeURIComponent(docId)}${
    !token && c.apiKey ? `?key=${c.apiKey}` : ''
  }`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: getBaseHeaders(token),
    body: JSON.stringify({
      fields: toFirestoreFields(data)
    })
  });

  if (!res.ok) {
    console.warn(`[firestoreRest] setDoc em ${collectionId}/${docId} falhou (status ${res.status}):`, await res.text());
    return false;
  }
  return true;
}

/**
 * Adiciona um documento com ID gerado automaticamente
 */
export async function addDocRest(
  collectionId: string,
  data: Record<string, any>,
  cfg?: FirestoreRestConfig
): Promise<string | null> {
  const c = resolveConfig(cfg);
  const token = await getServiceAccountAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/${c.databaseId}/documents/${collectionId}${
    !token && c.apiKey ? `?key=${c.apiKey}` : ''
  }`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getBaseHeaders(token),
    body: JSON.stringify({
      fields: toFirestoreFields(data)
    })
  });

  if (!res.ok) {
    console.warn(`[firestoreRest] addDoc em ${collectionId} falhou (status ${res.status}):`, await res.text());
    return null;
  }

  const responseData = await res.json();
  return responseData.name ? responseData.name.split('/').pop() : null;
}

/**
 * Exclui um documento no Firestore via REST
 */
export async function deleteDocRest(
  collectionId: string,
  docId: string,
  cfg?: FirestoreRestConfig
): Promise<boolean> {
  const c = resolveConfig(cfg);
  const token = await getServiceAccountAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/${c.databaseId}/documents/${collectionId}/${encodeURIComponent(docId)}${
    !token && c.apiKey ? `?key=${c.apiKey}` : ''
  }`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getBaseHeaders(token)
  });

  if (!res.ok && res.status !== 404) {
    console.warn(`[firestoreRest] deleteDoc em ${collectionId}/${docId} falhou (status ${res.status}):`, await res.text());
    return false;
  }
  return true;
}
