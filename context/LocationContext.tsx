'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType, isCircuitBroken } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';

export interface LocalVotacao {
  id: string;
  nome: string;
  zona: string;
  secao?: string;
  secoes?: string | string[];
  secoesAgregadas?: string | Record<string, string>;
  tipo?: string;
  bairro: string;
  endereco: string;
  capacidadeAprox?: number;
  municipio?: string;
  uf?: string;
  referencia?: string;
  eleitoresAptos?: number;
  latitude?: number;
  longitude?: number;
  dataCadastro?: any;
}

export const LOCAIS_PRESET_DEFAULT: Omit<LocalVotacao, 'id' | 'dataCadastro'>[] = [
  {
    nome: 'Unidade Escolar Benjamin Batista',
    zona: '1ª Zona',
    secao: '012',
    secoes: '012, 013, 014',
    bairro: 'Centro',
    endereco: 'Rua Desembargador Pires de Castro, 149 - Centro',
    referencia: 'Próximo à Praça do Fripisa',
    eleitoresAptos: 1250,
    latitude: -5.0892,
    longitude: -42.8016
  },
  {
    nome: 'Colégio Diocesano',
    zona: '1ª Zona',
    secao: '025',
    secoes: '025, 026, 027',
    bairro: 'Centro',
    endereco: 'Praça Saraiva, 110 - Centro',
    referencia: 'Em frente à Igreja São Benedito',
    eleitoresAptos: 1820,
    latitude: -5.0921,
    longitude: -42.8105
  },
  {
    nome: 'Escola Municipal Professor Marcílio Flávio Rangel',
    zona: '2ª Zona',
    secao: '045',
    secoes: '045, 046',
    bairro: 'Jockey',
    endereco: 'Rua das Orquídeas, 890 - Jockey',
    referencia: 'Atrás do Riverside Shopping',
    eleitoresAptos: 940,
    latitude: -5.0745,
    longitude: -42.7889
  },
  {
    nome: 'Instituto de Educação Antonino Freire (ISEAF)',
    zona: '2ª Zona',
    secao: '088',
    secoes: '088, 089, 090, 091',
    bairro: 'Matinha',
    endereco: 'Praça Firmina Sobreira, s/n - Matinha',
    referencia: 'Próximo ao Teatro 4 de Setembro',
    eleitoresAptos: 2150,
    latitude: -5.0831,
    longitude: -42.8152
  },
  {
    nome: 'Unidade Escolar Dom Barreto',
    zona: '63ª Zona',
    secao: '102',
    secoes: '102, 103, 104',
    bairro: 'Centro',
    endereco: 'Rua 24 de Janeiro, 468 - Centro',
    referencia: 'Centro da cidade',
    eleitoresAptos: 1450,
    latitude: -5.0905,
    longitude: -42.8082
  },
  {
    nome: 'Escola Municipal Jornalista Deoclécio Dantas',
    zona: '97ª Zona',
    secao: '150',
    secoes: '150, 151, 152',
    bairro: 'Vale Quem Tem',
    endereco: 'Av. Nicanor Barreto, 2300 - Vale Quem Tem',
    referencia: 'Zona Leste',
    eleitoresAptos: 1100,
    latitude: -5.0512,
    longitude: -42.7421
  },
  {
    nome: 'Centro Estadual de Educação Profissional José Pacífico de Silva',
    zona: '98ª Zona',
    secao: '070',
    secoes: '070, 071, 072',
    bairro: 'Novo Horizonte',
    endereco: 'Rua Maria da Paz Carvalho, s/n - Novo Horizonte',
    referencia: 'Próximo à Unidade Básica de Saúde',
    eleitoresAptos: 1320,
    latitude: -5.1123,
    longitude: -42.7654
  }
];

function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

interface LocationContextType {
  locais: LocalVotacao[];
  isLoaded: boolean;
  recarregarLocais: () => void;
  addLocalVotacao: (data: Omit<LocalVotacao, 'id' | 'dataCadastro'>) => Promise<string>;
  updateLocalVotacao: (id: string, data: Partial<LocalVotacao>) => Promise<void>;
  deleteLocalVotacao: (id: string) => Promise<void>;
  batchDeleteLocais: (ids: string[]) => Promise<{ deleted: number }>;
  seedLocaisDefault: () => Promise<void>;
  batchSaveLocais: (
    toCreate: Omit<LocalVotacao, 'id' | 'dataCadastro'>[],
    toUpdate: { id: string; dados: Partial<LocalVotacao> }[]
  ) => Promise<{ created: number; updated: number }>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthReady } = useAuth();
  const { currentTenant, subdomain, isLoadingTenant, activeDb, tenantVersion } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  const [locais, setLocais] = useState<LocalVotacao[]>(() => {
    const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
    if (cached?.data && cached.data.length > 0) {
      return cached.data;
    }
    // Fallback inicial com presets apenas para a campanha demonstrativa de Teresina
    if (tenantKey === 'demo' || tenantKey === 'teresina' || tenantKey === 'preview') {
      return LOCAIS_PRESET_DEFAULT.map((p, i) => ({
        id: `preset_${i}`,
        ...p,
        dataCadastro: new Date().toISOString()
      }));
    }
    return [];
  });
  const [isLoaded, setIsLoaded] = useState(true);

  const currentUserId = currentUser?.id;

  // Quando o tenant mudar, recarrega o cache específico do novo cliente
  useEffect(() => {
    const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
    if (cached?.data && cached.data.length > 0) {
      setLocais(cached.data);
    } else if (tenantKey === 'demo' || tenantKey === 'teresina' || tenantKey === 'preview') {
      setLocais(LOCAIS_PRESET_DEFAULT.map((p, i) => ({
        id: `preset_${i}`,
        ...p,
        dataCadastro: new Date().toISOString()
      })));
    } else {
      setLocais([]);
    }
    setIsLoaded(true);
  }, [tenantKey, tenantVersion]);

  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('locais_votacao', tenantKey)) {
      const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
      if (cached?.data && cached.data.length > 0) {
        setLocais(cached.data);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const q = query(collection(targetDb, 'locais_votacao'), orderBy('nome', 'asc'), limit(300));
    let isSubscribed = true;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed) return;
        const list: LocalVotacao[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as LocalVotacao);
        });

        if (list.length > 0) {
          setLocais(list);
          setCachedCollection('locais_votacao', list, tenantKey);
        } else if (tenantKey === 'demo' || tenantKey === 'teresina' || tenantKey === 'preview') {
          // Se for campanha de demonstração e banco vazio, utiliza os presets
          const presets = LOCAIS_PRESET_DEFAULT.map((p, i) => ({
            id: `preset_${i}`,
            ...p,
            dataCadastro: new Date().toISOString()
          }));
          setLocais(presets);
          setCachedCollection('locais_votacao', presets, tenantKey);
        } else {
          // Para outros clientes reais com banco próprio vazio, inicia limpo
          setLocais([]);
          setCachedCollection('locais_votacao', [], tenantKey);
        }
        setIsLoaded(true);
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.LIST, 'locais_votacao', tenantKey);
        const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setLocais(cached.data);
        }
        setIsLoaded(true);
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant]);

  const recarregarLocais = useCallback(() => {
    const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
    if (cached?.data) {
      setLocais(cached.data);
    }
  }, [tenantKey]);

  const addLocalVotacao = useCallback(async (data: Omit<LocalVotacao, 'id' | 'dataCadastro'>) => {
    const cleanData = sanitizeFirestoreData(data);
    const tempId = `temp_loc_${Date.now()}`;
    const newLoc: LocalVotacao = {
      id: tempId,
      ...cleanData,
      dataCadastro: new Date().toISOString()
    };

    setLocais((prev) => {
      const updated = [newLoc, ...prev];
      setCachedCollection('locais_votacao', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      const docRef = await addDoc(collection(targetDb, 'locais_votacao'), {
        ...cleanData,
        dataCadastro: serverTimestamp()
      });
      setLocais((prev) => {
        const updated = prev.map((l) => (l.id === tempId ? { ...l, id: docRef.id } : l));
        setCachedCollection('locais_votacao', updated, tenantKey);
        return updated;
      });
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'locais_votacao');
      return tempId;
    }
  }, [tenantKey, activeDb]);

  const updateLocalVotacao = useCallback(async (id: string, data: Partial<LocalVotacao>) => {
    const cleanData = sanitizeFirestoreData(data);
    setLocais((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, ...cleanData } : l));
      setCachedCollection('locais_votacao', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      await updateDoc(doc(targetDb, 'locais_votacao', id), cleanData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `locais_votacao/${id}`);
    }
  }, [tenantKey, activeDb]);

  const deleteLocalVotacao = useCallback(async (id: string) => {
    setLocais((prev) => {
      const updated = prev.filter((l) => l.id !== id);
      setCachedCollection('locais_votacao', updated, tenantKey);
      return updated;
    });

    try {
      const targetDb = activeDb || getActiveDb();
      await deleteDoc(doc(targetDb, 'locais_votacao', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `locais_votacao/${id}`);
    }
  }, [tenantKey, activeDb]);

  const batchDeleteLocais = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { deleted: 0 };
    const idSet = new Set(ids);
    setLocais((prev) => {
      const updated = prev.filter((l) => !idSet.has(l.id));
      setCachedCollection('locais_votacao', updated, tenantKey);
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
          batch.delete(doc(targetDb, 'locais_votacao', id));
        });
        await batch.commit();
        deleted += chunk.length;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'locais_votacao');
    }
    return { deleted: deleted || ids.length };
  }, [tenantKey, activeDb]);

  const seedLocaisDefault = useCallback(async () => {
    const presets = LOCAIS_PRESET_DEFAULT.map((p, i) => ({
      id: `seed_${Date.now()}_${i}`,
      ...p,
      dataCadastro: new Date().toISOString()
    }));
    setLocais(presets);
    setCachedCollection('locais_votacao', presets, tenantKey);

    try {
      const targetDb = activeDb || getActiveDb();
      for (const preset of LOCAIS_PRESET_DEFAULT) {
        await addDoc(collection(targetDb, 'locais_votacao'), {
          ...sanitizeFirestoreData(preset),
          dataCadastro: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'locais_votacao');
    }
  }, [tenantKey, activeDb]);

  const batchSaveLocais = useCallback(
    async (
      toCreate: Omit<LocalVotacao, 'id' | 'dataCadastro'>[],
      toUpdate: { id: string; dados: Partial<LocalVotacao> }[]
    ) => {
      let created = 0;
      let updated = 0;
      const CHUNK_SIZE = 400;

      // Atualização otimista
      setLocais((prev) => {
        let current = [...prev];
        toUpdate.forEach((u) => {
          current = current.map((l) => (l.id === u.id ? { ...l, ...u.dados } : l));
        });
        const createdItems: LocalVotacao[] = toCreate.map((c, i) => ({
          id: `new_loc_${Date.now()}_${i}`,
          ...c,
          dataCadastro: new Date().toISOString()
        }));
        const combined = [...createdItems, ...current];
        setCachedCollection('locais_votacao', combined, tenantKey);
        return combined;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
          const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(targetDb, 'locais_votacao', item.id);
            batch.update(docRef, sanitizeFirestoreData(item.dados));
          });
          await batch.commit();
          updated += chunk.length;
        }

        for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
          const chunk = toCreate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(collection(targetDb, 'locais_votacao'));
            batch.set(docRef, {
              ...sanitizeFirestoreData(item),
              dataCadastro: serverTimestamp()
            });
          });
          await batch.commit();
          created += chunk.length;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'locais_votacao');
      }

      return { created: created || toCreate.length, updated: updated || toUpdate.length };
    },
    [tenantKey, activeDb]
  );

  const value = useMemo(
    () => ({
      locais,
      isLoaded,
      recarregarLocais,
      addLocalVotacao,
      updateLocalVotacao,
      deleteLocalVotacao,
      batchDeleteLocais,
      seedLocaisDefault,
      batchSaveLocais
    }),
    [
      locais,
      isLoaded,
      recarregarLocais,
      addLocalVotacao,
      updateLocalVotacao,
      deleteLocalVotacao,
      batchDeleteLocais,
      seedLocaisDefault,
      batchSaveLocais
    ]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocations() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocations deve ser usado dentro de um LocationProvider');
  }
  return context;
}
