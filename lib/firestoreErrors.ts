import { getActiveAuth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Global Circuit Breaker state to prevent infinite retry loops and quota exhaustion
const circuitBreakers = new Map<string, number>();
const COOLDOWN_DURATION_MS = 60_000; // 60 seconds cooldown for failing paths

export function isCircuitBroken(path: string | null, tenantKey?: string): boolean {
  if (!path) return false;
  const key = tenantKey ? `${tenantKey}:${path}` : path;
  const expiration = circuitBreakers.get(key);
  if (!expiration) return false;
  if (Date.now() > expiration) {
    circuitBreakers.delete(key);
    return false;
  }
  return true;
}

export function tripCircuitBreaker(path: string | null, durationMs = COOLDOWN_DURATION_MS, tenantKey?: string): void {
  if (!path) return;
  const key = tenantKey ? `${tenantKey}:${path}` : path;
  circuitBreakers.set(key, Date.now() + durationMs);
}

export function resetCircuitBreaker(path?: string | null, tenantKey?: string): void {
  if (!path) {
    if (tenantKey) {
      const prefix = `${tenantKey}:`;
      for (const k of Array.from(circuitBreakers.keys())) {
        if (k.startsWith(prefix)) circuitBreakers.delete(k);
      }
    } else {
      circuitBreakers.clear();
    }
    return;
  }
  const key = tenantKey ? `${tenantKey}:${path}` : path;
  circuitBreakers.delete(key);
}

/**
 * Manipulador inteligente de erros do Firestore.
 * NUNCA lança exceções não tratadas no loop de eventos do React para evitar
 * loops infinitos de remontagem e explosão de leituras de cota.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  tenantKey?: string
): FirestoreErrorInfo {
  const errMsg = error instanceof Error ? error.message : String(error);
  const activeAuth = getActiveAuth();
  const currentFbUser = activeAuth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: currentFbUser?.uid,
      email: currentFbUser?.email,
      emailVerified: currentFbUser?.emailVerified,
      isAnonymous: currentFbUser?.isAnonymous,
      tenantId: currentFbUser?.tenantId,
      providerInfo: currentFbUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };

  const isQuota =
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('429') ||
    errMsg.includes('resource-exhausted');

  const isPermission =
    errMsg.includes('permission-denied') ||
    errMsg.includes('Missing or insufficient permissions') ||
    errMsg.includes('403');

  // Ativa circuit breaker no caminho afetado para evitar retentativas agressivas
  if (path && (isQuota || isPermission)) {
    tripCircuitBreaker(path, isQuota ? 180_000 : 30_000, tenantKey);
  }

  // Notifica componentes e banners sem travar a thread
  if (typeof window !== 'undefined') {
    if (isQuota) {
      try {
        window.dispatchEvent(
          new CustomEvent('firestore-quota-exceeded', {
            detail: { path, operationType, error: errMsg }
          })
        );
      } catch {}
    } else if (
      operationType === OperationType.CREATE ||
      operationType === OperationType.UPDATE ||
      operationType === OperationType.DELETE
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent('firestore-operation-error', {
            detail: { path, operationType, error: errMsg }
          })
        );
      } catch {}
    }
  }

  console.warn(`[Firestore Safe Handler] (${operationType} em ${path}):`, errMsg);

  // Retorna info segura sem lançar 'throw' para preservar a estabilidade da UI
  return errInfo;
}
