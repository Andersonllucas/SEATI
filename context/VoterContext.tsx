'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType, isCircuitBroken } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';
import { useCampaignUI } from './CampaignUIContext';

export interface Eleitor {
  id: string;
  nome: string;
  cpf: string;
  tituloEleitor?: string;
  telefone: string;
  whatsapp?: string;
  zona: string;
  secao: string;
  bairro: string;
  cidade?: string;
  estado?: string;
  endereco?: string;
  cep?: string;
  liderancaId?: string;
  lideranca?: string;
  indicadoPor?: string;
  status?: string;
  observacoes?: string;
  dataCadastro?: any;
  userId?: string;
}

export interface CpfConflictGroup {
  cpfClean: string;
  formattedCpf: string;
  voters: Eleitor[];
  count: number;
  liderancas: string[];
}

export interface TituloConflictGroup {
  tituloClean: string;
  formattedTitulo: string;
  voters: Eleitor[];
  count: number;
  liderancas: string[];
}

export const cleanCpfUtil = (cpf?: string): string => {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '');
};

export const cleanTituloUtil = (titulo?: string): string => {
  if (!titulo) return '';
  return titulo.replace(/\D/g, '');
};

/**
 * Formata o Título de Eleitor em 3 blocos de 4 dígitos: 0000.0000.0000
 */
export const formatTituloUtil = (val?: string): string => {
  if (!val) return '';
  const digits = val.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 8)}.${digits.slice(8, 12)}`;
};

function sanitizeFirestoreData<T extends Record<string, any>>(data: T): T {
  const sanitized: Record<string, any> = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      sanitized[key] = data[key];
    }
  });
  return sanitized as T;
}

interface VoterContextType {
  eleitores: Eleitor[];
  isLoaded: boolean;
  cpfConflictGroups: CpfConflictGroup[];
  tituloConflictGroups: TituloConflictGroup[];
  conflictingCpfVoterIds: Set<string>;
  conflictingTituloVoterIds: Set<string>;
  conflictingVoterIds: Set<string>;
  totalEleitores: number;
  totalConflitos: number;
  cleanCpf: (cpf?: string) => string;
  cleanTitulo: (titulo?: string) => string;
  recarregarEleitores: () => void;
  addEleitorQuick: (data: Omit<Eleitor, 'id' | 'dataCadastro'>) => Promise<string>;
  updateEleitorQuick: (id: string, data: Partial<Eleitor>) => Promise<void>;
  deleteEleitorQuick: (id: string) => Promise<void>;
  batchImportEleitores: (
    voters: Omit<Eleitor, 'id' | 'dataCadastro'>[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ imported: number }>;
  batchDeleteEleitores: (ids: string[]) => Promise<{ deleted: number }>;
  batchUpdateEleitores: (ids: string[], data: Partial<Eleitor>) => Promise<{ updated: number }>;
}

const VoterContext = createContext<VoterContextType | undefined>(undefined);

export function VoterProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthReady } = useAuth();
  const { currentTenant, subdomain, isLoadingTenant, activeDb, tenantVersion } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  const [eleitores, setEleitores] = useState<Eleitor[]>(() => {
    // Inicialização instantânea a partir do cache local isolado por tenant
    const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
    return cached?.data || [];
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
    return !!cached?.data;
  });
  const { setTotalConflitosCount } = useCampaignUI();

  const currentUserId = currentUser?.id;

  // Quando o tenant ou banco mudar, sincroniza imediatamente com o cache específico daquele cliente
  useEffect(() => {
    const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
    setEleitores(cached?.data || []);
    setIsLoaded(!!cached?.data);
  }, [tenantKey, tenantVersion]);

  // Carrega e sincroniza eleitores de forma inteligente do Firestore ativo
  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    // Se o circuit breaker estiver ativo (cota atingida ou erro recente), serve do cache
    if (isCircuitBroken('eleitores', tenantKey)) {
      const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
      if (cached?.data) {
        setEleitores(cached.data);
        setIsLoaded(true);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    // Consulta com limite de segurança para otimizar leituras no banco do cliente atual
    const q = query(collection(targetDb, 'eleitores'), orderBy('dataCadastro', 'desc'), limit(1000));
    
    let isSubscribed = true;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed) return;
        const voters: Eleitor[] = [];
        snapshot.forEach((d) => {
          voters.push({ id: d.id, ...d.data() } as Eleitor);
        });
        setEleitores(voters);
        setIsLoaded(true);
        // Atualiza cache local isolado por tenant
        setCachedCollection('eleitores', voters, tenantKey);
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.LIST, 'eleitores', tenantKey);
        // Em caso de falha ou cota, preserva dados em cache do tenant atual
        const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setEleitores(cached.data);
        }
        setIsLoaded(true);
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant]);

  // Precompute CPF conflict groups
  const cpfConflictGroups = useMemo(() => {
    const map = new Map<string, Eleitor[]>();
    eleitores.forEach((e) => {
      const clean = cleanCpfUtil(e.cpf);
      if (clean && clean.length === 11) {
        if (!map.has(clean)) {
          map.set(clean, []);
        }
        map.get(clean)!.push(e);
      }
    });

    const conflicts: CpfConflictGroup[] = [];
    map.forEach((list, clean) => {
      if (list.length > 1) {
        const liderancasEnvolvidas = Array.from(
          new Set(list.map((v) => v.lideranca || 'Sem Liderança'))
        );
        conflicts.push({
          cpfClean: clean,
          formattedCpf: list[0].cpf || clean,
          voters: list,
          count: list.length,
          liderancas: liderancasEnvolvidas
        });
      }
    });

    return conflicts;
  }, [eleitores]);

  // Precompute Titulo conflict groups
  const tituloConflictGroups = useMemo(() => {
    const map = new Map<string, Eleitor[]>();
    eleitores.forEach((e) => {
      const clean = cleanTituloUtil(e.tituloEleitor);
      if (clean && clean.length >= 6) {
        if (!map.has(clean)) {
          map.set(clean, []);
        }
        map.get(clean)!.push(e);
      }
    });

    const conflicts: TituloConflictGroup[] = [];
    map.forEach((list, clean) => {
      if (list.length > 1) {
        const liderancasEnvolvidas = Array.from(
          new Set(list.map((v) => v.lideranca || 'Sem Liderança'))
        );
        conflicts.push({
          tituloClean: clean,
          formattedTitulo: list[0].tituloEleitor || clean,
          voters: list,
          count: list.length,
          liderancas: liderancasEnvolvidas
        });
      }
    });

    return conflicts;
  }, [eleitores]);

  const conflictingCpfVoterIds = useMemo(() => {
    const set = new Set<string>();
    cpfConflictGroups.forEach((g) => {
      g.voters.forEach((v) => set.add(v.id));
    });
    return set;
  }, [cpfConflictGroups]);

  const conflictingTituloVoterIds = useMemo(() => {
    const set = new Set<string>();
    tituloConflictGroups.forEach((g) => {
      g.voters.forEach((v) => set.add(v.id));
    });
    return set;
  }, [tituloConflictGroups]);

  // Unificação de conflitos (conflito por CPF ou por Título)
  const conflictingVoterIds = useMemo(() => {
    const set = new Set<string>(conflictingCpfVoterIds);
    conflictingTituloVoterIds.forEach((id) => set.add(id));
    return set;
  }, [conflictingCpfVoterIds, conflictingTituloVoterIds]);

  const totalEleitores = eleitores.length;
  const totalConflitos = cpfConflictGroups.length + tituloConflictGroups.length;

  useEffect(() => {
    setTotalConflitosCount(totalConflitos);
  }, [totalConflitos, setTotalConflitosCount]);

  const recarregarEleitores = useCallback(() => {
    const cached = getCachedCollection<Eleitor>('eleitores', undefined, tenantKey);
    if (cached?.data) {
      setEleitores(cached.data);
    }
  }, [tenantKey]);

  const addEleitorQuick = useCallback(async (data: Omit<Eleitor, 'id' | 'dataCadastro'>) => {
    const cleanData = sanitizeFirestoreData({
      ...data,
      status: data.status || 'Pendente de confirmação'
    });
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newEleitor: Eleitor = {
      id: tempId,
      ...cleanData,
      dataCadastro: new Date().toISOString()
    };

    // Atualização otimista imediata no estado e cache do tenant
    setEleitores((prev) => {
      const updated = [newEleitor, ...prev];
      setCachedCollection('eleitores', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      const docRef = await addDoc(collection(targetDb, 'eleitores'), {
        ...cleanData,
        dataCadastro: serverTimestamp()
      });
      // Atualiza ID definitivo
      setEleitores((prev) => {
        const updated = prev.map((e) => (e.id === tempId ? { ...e, id: docRef.id } : e));
        setCachedCollection('eleitores', updated, tenantKey);
        return updated;
      });
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'eleitores');
      return tempId;
    }
  }, [tenantKey, activeDb]);

  const deleteEleitorQuick = useCallback(async (id: string) => {
    // Remoção otimista imediata
    setEleitores((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      setCachedCollection('eleitores', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      await deleteDoc(doc(targetDb, 'eleitores', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `eleitores/${id}`);
    }
  }, [tenantKey, activeDb]);

  const updateEleitorQuick = useCallback(async (id: string, data: Partial<Eleitor>) => {
    const cleanData = sanitizeFirestoreData(data);
    
    // Atualização otimista imediata
    setEleitores((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, ...cleanData } : e));
      setCachedCollection('eleitores', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      await updateDoc(doc(targetDb, 'eleitores', id), cleanData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `eleitores/${id}`);
    }
  }, [tenantKey, activeDb]);

  const batchImportEleitores = useCallback(
    async (
      voters: Omit<Eleitor, 'id' | 'dataCadastro'>[],
      onProgress?: (done: number, total: number) => void
    ) => {
      let imported = 0;
      const CHUNK_SIZE = 400;
      const total = voters.length;

      // Adição otimista no estado e cache
      const newItems: Eleitor[] = voters.map((v, i) => ({
        id: `imp_${Date.now()}_${i}`,
        ...sanitizeFirestoreData({
          ...v,
          status: v.status || 'Pendente de confirmação'
        }),
        dataCadastro: new Date().toISOString()
      }));

      setEleitores((prev) => {
        const updated = [...newItems, ...prev];
        setCachedCollection('eleitores', updated, tenantKey);
        return updated;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        for (let i = 0; i < voters.length; i += CHUNK_SIZE) {
          const chunk = voters.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(collection(targetDb, 'eleitores'));
            batch.set(docRef, {
              ...sanitizeFirestoreData({
                ...item,
                status: item.status || 'Pendente de confirmação'
              }),
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
        handleFirestoreError(err, OperationType.WRITE, 'eleitores');
      }

      return { imported: imported || voters.length };
    },
    [tenantKey, activeDb]
  );

  const batchDeleteEleitores = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setEleitores((prev) => {
      const updated = prev.filter((e) => !idSet.has(e.id));
      setCachedCollection('eleitores', updated, tenantKey);
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
          batch.delete(doc(targetDb, 'eleitores', id));
        });
        await batch.commit();
        deleted += chunk.length;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'eleitores');
    }
    return { deleted: deleted || ids.length };
  }, [tenantKey, activeDb]);

  const batchUpdateEleitores = useCallback(async (ids: string[], data: Partial<Eleitor>) => {
    const idSet = new Set(ids);
    const cleanData = sanitizeFirestoreData(data);
    
    setEleitores((prev) => {
      const updated = prev.map((e) => (idSet.has(e.id) ? { ...e, ...cleanData } : e));
      setCachedCollection('eleitores', updated, tenantKey);
      return updated;
    });

    let updated = 0;
    const CHUNK_SIZE = 400;
    try {
      const targetDb = activeDb || getActiveDb();
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(targetDb);
        chunk.forEach((id) => {
          batch.update(doc(targetDb, 'eleitores', id), cleanData);
        });
        await batch.commit();
        updated += chunk.length;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'eleitores');
    }
    return { updated: updated || ids.length };
  }, [tenantKey, activeDb]);

  const value = useMemo(
    () => ({
      eleitores,
      isLoaded,
      cpfConflictGroups,
      tituloConflictGroups,
      conflictingCpfVoterIds,
      conflictingTituloVoterIds,
      conflictingVoterIds,
      totalEleitores,
      totalConflitos,
      cleanCpf: cleanCpfUtil,
      cleanTitulo: cleanTituloUtil,
      recarregarEleitores,
      addEleitorQuick,
      updateEleitorQuick,
      deleteEleitorQuick,
      batchImportEleitores,
      batchDeleteEleitores,
      batchUpdateEleitores
    }),
    [
      eleitores,
      isLoaded,
      cpfConflictGroups,
      tituloConflictGroups,
      conflictingCpfVoterIds,
      conflictingTituloVoterIds,
      conflictingVoterIds,
      totalEleitores,
      totalConflitos,
      recarregarEleitores,
      addEleitorQuick,
      updateEleitorQuick,
      deleteEleitorQuick,
      batchImportEleitores,
      batchDeleteEleitores,
      batchUpdateEleitores
    ]
  );

  return <VoterContext.Provider value={value}>{children}</VoterContext.Provider>;
}

export function useVoters() {
  const context = useContext(VoterContext);
  if (!context) {
    throw new Error('useVoters deve ser usado dentro de um VoterProvider');
  }
  return context;
}
