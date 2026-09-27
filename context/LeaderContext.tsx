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
  telefone?: string;
  email?: string;
  regiao: string;
  bairro: string;
  metaVotos: number;
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
  recarregarLiderancas: () => void;
  batchImportLiderancas: (
    leaders: Omit<Lideranca, 'id' | 'dataCadastro'>[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ imported: number }>;
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

  // Quando o tenant mudar, sincroniza com o cache específico desse cliente
  useEffect(() => {
    const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
    setLiderancas(cached?.data || []);
    setIsLoaded(!!cached?.data);
  }, [tenantKey, tenantVersion]);

  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('liderancas', tenantKey)) {
      const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
      if (cached?.data) {
        setLiderancas(cached.data);
        setIsLoaded(true);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const q = query(collection(targetDb, 'liderancas'), orderBy('nome', 'asc'), limit(500));
    let isSubscribed = true;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed) return;
        const leaders: Lideranca[] = [];
        snapshot.forEach((d) => {
          leaders.push({ id: d.id, ...d.data() } as Lideranca);
        });
        setLiderancas(leaders);
        setIsLoaded(true);
        setCachedCollection('liderancas', leaders, tenantKey);
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.LIST, 'liderancas', tenantKey);
        const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setLiderancas(cached.data);
        }
        setIsLoaded(true);
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant]);

  const recarregarLiderancas = useCallback(() => {
    const cached = getCachedCollection<Lideranca>('liderancas', undefined, tenantKey);
    if (cached?.data) {
      setLiderancas(cached.data);
    }
  }, [tenantKey]);

  const totalLiderancasAtivas = useMemo(() => {
    return liderancas.filter((l) => l.status !== 'Inativa').length;
  }, [liderancas]);

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
      batchImportLiderancas
    }),
    [liderancas, isLoaded, totalLiderancasAtivas, recarregarLiderancas, batchImportLiderancas]
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
