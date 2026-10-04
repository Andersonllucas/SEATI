'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType, isCircuitBroken } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';

export interface Lideranca {
  id: string;
  nome: string;
  tipo: 'Liderança Principal' | 'Sub-liderança';
  liderancaPaiId?: string;
  liderancaPaiNome?: string;
  cpf?: string;
  tituloEleitor?: string;
  zona?: string;
  secao?: string;
  telefone?: string;
  email?: string;
  regiao?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  metaVotos?: number;
  status: 'Ativa' | 'Em Formação' | 'Inativa';
  observacoes?: string;
  dataCadastro?: any;
}

function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

interface LeaderContextType {
  liderancas: Lideranca[];
  isLoaded: boolean;
  totalLiderancasAtivas: number;
  recarregarLiderancas: () => Promise<void>;
  batchImportLiderancas: (
    leaders: Omit<Lideranca, 'id' | 'dataCadastro'>[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ imported: number }>;
  batchDeleteLiderancas: (ids: string[]) => Promise<{ deleted: number }>;
}

const LeaderContext = createContext<LeaderContextType | undefined>(undefined);

export function LeaderProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthReady } = useAuth();
  const { currentTenant, subdomain, isLoadingTenant, activeDb, tenantVersion } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  const [liderancas, setLiderancas] = useState<Lideranca[]>(() => {
    // Inicialização instantânea do cache local isolado por tenant
    const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
    return cached?.data || [];
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
    return !!cached?.data;
  });

  const currentUserId = currentUser?.id;

  // Busca de fallback via API REST do servidor (garante leitura mesmo com restrições de rede ou regras)
  const fetchLiderancasRest = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/tenant/liderancas?subdomain=${encodeURIComponent(key)}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.liderancas)) {
          const sorted = [...data.liderancas].sort((a, b) =>
            (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
          );
          setLiderancas(sorted);
          setIsLoaded(true);
          setCachedCollection('liderancas', sorted, key);
          return sorted;
        }
      }
    } catch (e) {
      console.warn('Fallback REST de lideranças falhou:', e);
    }
    return null;
  }, []);

  // Quando o tenant mudar, sincroniza com o cache específico desse cliente e busca se vazio
  useEffect(() => {
    const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
    if (cached?.data && cached.data.length > 0) {
      setLiderancas(cached.data);
      setIsLoaded(true);
    } else {
      setLiderancas([]);
      // Tenta carregar via REST imediatamente
      fetchLiderancasRest(tenantKey);
    }
  }, [tenantKey, tenantVersion, fetchLiderancasRest]);

  useEffect(() => {
    if (!isAuthReady || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('liderancas', tenantKey)) {
      const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
      if (cached?.data) {
        setLiderancas(cached.data);
        setIsLoaded(true);
      } else {
        fetchLiderancasRest(tenantKey);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    // Consulta direta sem dependência de index de ordenação do Firestore
    const q = query(collection(targetDb, 'liderancas'), limit(1000));
    let isSubscribed = true;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed) return;
        const leaders: Lideranca[] = [];
        snapshot.forEach((d) => {
          leaders.push({ id: d.id, ...d.data() } as Lideranca);
        });

        // Ordenação segura em memória por ordem alfabética de nome
        leaders.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));

        if (leaders.length === 0) {
          // Se snapshot vier vazio, checa se há dados no fallback REST (ex: tenant com permissão de leitura restrita)
          fetchLiderancasRest(tenantKey).then((restLeaders) => {
            if (isSubscribed && restLeaders && restLeaders.length > 0) {
              setLiderancas(restLeaders);
            } else if (isSubscribed) {
              setLiderancas([]);
            }
          });
        } else {
          setLiderancas(leaders);
          setCachedCollection('liderancas', leaders, tenantKey);
        }
        setIsLoaded(true);
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.LIST, 'liderancas', tenantKey);
        const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setLiderancas(cached.data);
        } else {
          fetchLiderancasRest(tenantKey);
        }
        setIsLoaded(true);
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant, fetchLiderancasRest]);

  const recarregarLiderancas = useCallback(async () => {
    const restLeaders = await fetchLiderancasRest(tenantKey);
    if (!restLeaders) {
      const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
      if (cached?.data) {
        setLiderancas(cached.data);
      }
    }
  }, [tenantKey, fetchLiderancasRest]);

  const totalLiderancasAtivas = useMemo(() => {
    return liderancas.filter((l) => l.status !== 'Inativa').length;
  }, [liderancas]);

  const batchDeleteLiderancas = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      setLiderancas((prev) => {
        const updated = prev.filter((l) => !idSet.has(l.id));
        setCachedCollection('liderancas', updated, tenantKey);
        return updated;
      });

      let deleted = 0;
      const CHUNK_SIZE = 400;
      try {
        const targetDb = activeDb || getActiveDb();
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((id) => {
            batch.delete(doc(targetDb, 'liderancas', id));
          });
          await batch.commit();
          deleted += chunk.length;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'liderancas');
      }
      return { deleted: deleted || ids.length };
    },
    [tenantKey, activeDb]
  );

  const batchImportLiderancas = useCallback(
    async (
      leaders: Omit<Lideranca, 'id' | 'dataCadastro'>[],
      onProgress?: (done: number, total: number) => void
    ) => {
      let imported = 0;
      const CHUNK_SIZE = 400;
      const total = leaders.length;

      const newItems: Lideranca[] = leaders.map((l, i) => ({
        id: `imp_lid_${Date.now()}_${i}`,
        ...sanitizeFirestoreData(l),
        dataCadastro: new Date().toISOString()
      }));

      setLiderancas((prev) => {
        const updated = [...newItems, ...prev];
        setCachedCollection('liderancas', updated, tenantKey);
        return updated;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        for (let i = 0; i < leaders.length; i += CHUNK_SIZE) {
          const chunk = leaders.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(collection(targetDb, 'liderancas'));
            batch.set(docRef, {
              ...sanitizeFirestoreData(item),
              dataCadastro: serverTimestamp()
            });
          });
          await batch.commit();
          imported += chunk.length;
          if (onProgress) {
            onProgress(Math.min(imported, total), total);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'liderancas');
      }

      return { imported: imported || leaders.length };
    },
    [tenantKey, activeDb]
  );

  const value = useMemo(
    () => ({
      liderancas,
      isLoaded,
      totalLiderancasAtivas,
      recarregarLiderancas,
      batchImportLiderancas,
      batchDeleteLiderancas
    }),
    [liderancas, isLoaded, totalLiderancasAtivas, recarregarLiderancas, batchImportLiderancas, batchDeleteLiderancas]
  );

  return <LeaderContext.Provider value={value}>{children}</LeaderContext.Provider>;
}

export function useLeaders() {
  const context = useContext(LeaderContext);
  if (!context) {
    throw new Error('useLeaders deve ser usado dentro de um LeaderProvider');
  }
  return context;
}
