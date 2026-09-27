'use client';

/**
 * Módulo de Cache Otimizado para Firestore (Multi-camada: Memória + LocalStorage)
 * Reduz drasticamente o consumo de leituras do Firestore servindo dados do cache local,
 * prevenindo estouro do teto gratuito diário (50k) e permitindo navegação offline/resiliente.
 * ISOLADO POR TENANT / SUBDOMÍNIO: Garante que dados de um cliente nunca vazem para outro.
 */

interface CacheEnvelope<T> {
  timestamp: number;
  data: T[];
  tenant?: string;
}

const memoryCache = new Map<string, CacheEnvelope<any>>();
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutos de dados considerados frescos

// Limpa chaves antigas não-particionadas de versões anteriores que poderiam conter dados da demo
if (typeof window !== 'undefined') {
  try {
    ['adti_cache_eleitores', 'adti_cache_liderancas', 'adti_cache_locais_votacao', 'adti_cache_usuarios'].forEach((k) => {
      localStorage.removeItem(k);
    });
  } catch {}
}

function resolveTenantKey(explicitTenantKey?: string): string {
  if (explicitTenantKey && explicitTenantKey.trim()) {
    return explicitTenantKey.trim().toLowerCase();
  }
  if (typeof window !== 'undefined') {
    const fromStorage = localStorage.getItem('adti_active_subdomain') || localStorage.getItem('seati_active_subdomain');
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim().toLowerCase();
    }
  }
  return 'central';
}

export function getCachedCollection<T>(
  collectionName: string,
  maxAgeMs = DEFAULT_TTL_MS,
  tenantKey?: string
): {
  data: T[];
  isFresh: boolean;
  timestamp: number;
} | null {
  const tKey = resolveTenantKey(tenantKey);
  const cacheKey = `${tKey}_${collectionName}`;

  // 1. Verifica memória rápida
  const inMem = memoryCache.get(cacheKey);
  if (inMem) {
    const age = Date.now() - inMem.timestamp;
    return {
      data: inMem.data,
      isFresh: age < maxAgeMs,
      timestamp: inMem.timestamp,
    };
  }

  // 2. Verifica LocalStorage
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(`adti_cache_${cacheKey}`);
    if (!raw) return null;

    const parsed: CacheEnvelope<T> = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;

    // Atualiza cache em memória para acessos subsequentes
    memoryCache.set(cacheKey, parsed);

    const age = Date.now() - parsed.timestamp;
    return {
      data: parsed.data,
      isFresh: age < maxAgeMs,
      timestamp: parsed.timestamp,
    };
  } catch (e) {
    console.warn(`[FirestoreCache] Erro ao ler cache de ${cacheKey}:`, e);
    return null;
  }
}

export function setCachedCollection<T>(
  collectionName: string,
  data: T[],
  tenantKey?: string
): void {
  const tKey = resolveTenantKey(tenantKey);
  const cacheKey = `${tKey}_${collectionName}`;

  const envelope: CacheEnvelope<T> = {
    timestamp: Date.now(),
    data,
    tenant: tKey
  };

  // Salva em memória
  memoryCache.set(cacheKey, envelope);

  // Salva em LocalStorage (com tratamento de exceção de quota)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`adti_cache_${cacheKey}`, JSON.stringify(envelope));
    } catch (e) {
      console.warn(`[FirestoreCache] Aviso ao salvar LocalStorage para ${cacheKey}:`, e);
    }
  }
}

export function invalidateCollectionCache(collectionName: string, tenantKey?: string): void {
  const tKey = resolveTenantKey(tenantKey);
  const cacheKey = `${tKey}_${collectionName}`;

  memoryCache.delete(cacheKey);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`adti_cache_${cacheKey}`);
    } catch {}
  }
}

export function clearAllFirestoreCache(tenantKey?: string): void {
  if (tenantKey) {
    const tKey = tenantKey.trim().toLowerCase();
    const prefix = `${tKey}_`;
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(prefix)) {
        memoryCache.delete(k);
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const storagePrefix = `adti_cache_${prefix}`;
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith(storagePrefix)) {
            localStorage.removeItem(k);
          }
        }
      } catch {}
    }
    return;
  }

  memoryCache.clear();
  if (typeof window !== 'undefined') {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('adti_cache_')) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }
}
