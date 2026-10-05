'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  getCountFromServer,
  startAfter,
  where,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType, isCircuitBroken } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';
import { safeStorage } from '@/lib/safeStorage';
import { sanitizeSecoesFromAptosNumbers } from '@/lib/importExportUtils';

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

export interface FetchLocaisParams {
  pageSize?: number;
  startAfterDoc?: QueryDocumentSnapshot | null;
  searchTerm?: string;
  selectedZona?: string;
}

export interface FetchLocaisResult {
  locais: LocalVotacao[];
  lastDoc: QueryDocumentSnapshot | null;
  firstDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
  totalCount?: number;
}

export interface LocaisResumoStats {
  totalLocais: number;
  totalSecoes: number;
  totalCapacidade: number;
  registeredPairs?: string[];
  registeredPairsSample?: string[];
  atualizadoEm?: string;
}

export function matchLocalFilter(
  local: LocalVotacao,
  searchTerm: string,
  selectedZona: string = 'todas'
): boolean {
  // 1. Filtro de zona eleitoral
  if (selectedZona && selectedZona !== 'todas') {
    const filterZonaDigits = selectedZona.replace(/\D/g, '');
    const localZonaDigits = (local.zona || '').replace(/\D/g, '');
    const matchZona =
      local.zona === selectedZona ||
      (filterZonaDigits.length > 0 && localZonaDigits === filterZonaDigits);
    if (!matchZona) return false;
  }

  const rawQuery = (searchTerm || '').trim();
  if (!rawQuery) return true;

  const cleanQuery = rawQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const nomeNorm = (local.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bairroNorm = (local.bairro || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const endNorm = (local.endereco || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const munNorm = (local.municipio || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const zonaNorm = (local.zona || '').toLowerCase();
  const zonaDigits = (local.zona || '').replace(/\D/g, '');
  const agregadasStr = String(local.secoesAgregadas || '').toLowerCase();

  // Coleta todas as seções (secao única ou array/string de secoes)
  const secoesList: string[] = [];
  if (local.secao) secoesList.push(String(local.secao).trim());
  if (Array.isArray(local.secoes)) {
    local.secoes.forEach((s) => {
      const trimmed = String(s).trim();
      if (trimmed) secoesList.push(trimmed);
    });
  } else if (local.secoes) {
    String(local.secoes)
      .split(',')
      .forEach((s) => {
        const trimmed = s.trim();
        if (trimmed) secoesList.push(trimmed);
      });
  }

  // Tokeniza os termos para permitir buscas multi-palavras (ex: "escola centro", "são josé", "070")
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  return tokens.every((token) => {
    const tokenDigits = token.replace(/\D/g, '');

    const textMatch =
      nomeNorm.includes(token) ||
      bairroNorm.includes(token) ||
      endNorm.includes(token) ||
      munNorm.includes(token) ||
      zonaNorm.includes(token) ||
      agregadasStr.includes(token);

    const secaoMatch = secoesList.some((s) => {
      const sDigits = s.replace(/\D/g, '');
      const sNorm = s.toLowerCase();
      if (sNorm.includes(token)) return true;
      if (tokenDigits.length > 0) {
        if (sDigits === tokenDigits) return true;
        if (Number(sDigits) === Number(tokenDigits)) return true;
        if (sDigits.includes(tokenDigits)) return true;
      }
      return false;
    });

    const zonaMatch =
      tokenDigits.length > 0 &&
      (zonaDigits === tokenDigits || Number(zonaDigits) === Number(tokenDigits));

    return textMatch || secaoMatch || zonaMatch;
  });
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
  totalLocaisCount: number;
  totalSecoesCount: number;
  totalCapacidadeCount: number;
  registeredPairsList: string[];
  isLoaded: boolean;
  isLoadingLocais: boolean;
  recarregarLocais: () => Promise<void>;
  fetchLocaisPage: (params?: FetchLocaisParams) => Promise<FetchLocaisResult>;
  fetchLocaisCount: () => Promise<number>;
  fetchResumoStats: () => Promise<LocaisResumoStats>;
  fetchAllLocaisDedicated: (forceRefresh?: boolean) => Promise<LocalVotacao[]>;
  fetchAllMatchingIds: (params: { searchTerm?: string; selectedZona?: string }) => Promise<string[]>;
  addLocalVotacao: (data: Omit<LocalVotacao, 'id' | 'dataCadastro'>) => Promise<string>;
  updateLocalVotacao: (id: string, data: Partial<LocalVotacao>) => Promise<void>;
  deleteLocalVotacao: (id: string) => Promise<void>;
  batchDeleteLocais: (ids: string[]) => Promise<{ deleted: number }>;
  clearAllLocais: () => Promise<{ deleted: number }>;
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
    const isCleared = safeStorage.getItem(`locais_cleared_${tenantKey}`) === 'true';
    if (isCleared) return [];

    const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
    if (cached?.data && cached.data.length > 0) {
      return cached.data;
    }
    return [];
  });
  const [totalLocaisCount, setTotalLocaisCount] = useState<number>(() => {
    const saved = safeStorage.getItem(`locais_count_${tenantKey}`);
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [totalSecoesCount, setTotalSecoesCount] = useState<number>(() => {
    const saved = safeStorage.getItem(`locais_secoes_count_${tenantKey}`);
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [totalCapacidadeCount, setTotalCapacidadeCount] = useState<number>(() => {
    const saved = safeStorage.getItem(`locais_capacidade_count_${tenantKey}`);
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [registeredPairsList, setRegisteredPairsList] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(true);
  const [isLoadingLocais, setIsLoadingLocais] = useState(false);

  // Cache em memória dos locais completos para buscas dedicadas pontuais sem travamento
  const dedicatedCacheRef = useRef<{ data: LocalVotacao[]; timestamp: number } | null>(null);

  const currentUserId = currentUser?.id;

  // Consulta dedicada da base completa (para busca pontual e seleção de todos)
  const fetchAllLocaisDedicated = useCallback(
    async (forceRefresh = false): Promise<LocalVotacao[]> => {
      const now = Date.now();
      if (!forceRefresh && dedicatedCacheRef.current && now - dedicatedCacheRef.current.timestamp < 120000) {
        return dedicatedCacheRef.current.data;
      }
      const targetDb = activeDb || getActiveDb();
      const snap = await getDocs(collection(targetDb, 'locais_votacao'));
      const list: LocalVotacao[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const rawSecoes = Array.isArray(data.secoes)
          ? data.secoes
          : (data.secao ? [data.secao] : (typeof data.secoes === 'string' ? data.secoes.split(',').map((s: string) => s.trim()) : []));
        const cleanSecoes = sanitizeSecoesFromAptosNumbers(
          rawSecoes,
          typeof data.secoesAgregadas === 'string' ? data.secoesAgregadas : undefined
        );
        list.push({ id: d.id, ...data, secoes: cleanSecoes } as LocalVotacao);
      });
      dedicatedCacheRef.current = { data: list, timestamp: now };
      return list;
    },
    [activeDb]
  );

  // Retorna todos os IDs correspondentes ao filtro ativo consultando a base inteira (para Selecionar Todos)
  const fetchAllMatchingIds = useCallback(
    async (params: { searchTerm?: string; selectedZona?: string }): Promise<string[]> => {
      const all = await fetchAllLocaisDedicated();
      const matched = all.filter((l) =>
        matchLocalFilter(l, params.searchTerm || '', params.selectedZona || 'todas')
      );
      return matched.map((l) => l.id);
    },
    [fetchAllLocaisDedicated]
  );

  // Consulta resumo estatístico agregado global (locais, seções totais, capacidade total)
  const fetchResumoStats = useCallback(async (): Promise<LocaisResumoStats> => {
    try {
      const targetDb = activeDb || getActiveDb();
      const docSnap = await getDoc(doc(targetDb, 'configuracoes', 'locais_resumo'));
      if (docSnap.exists()) {
        const d = docSnap.data() as LocaisResumoStats;
        if (d.totalLocais > 0) {
          setTotalLocaisCount(d.totalLocais);
          setTotalSecoesCount(d.totalSecoes || 0);
          setTotalCapacidadeCount(d.totalCapacidade || 0);
          const pairs = d.registeredPairs || d.registeredPairsSample || [];
          setRegisteredPairsList(pairs);
          safeStorage.setItem(`locais_count_${tenantKey}`, String(d.totalLocais));
          safeStorage.setItem(`locais_secoes_count_${tenantKey}`, String(d.totalSecoes || 0));
          safeStorage.setItem(`locais_capacidade_count_${tenantKey}`, String(d.totalCapacidade || 0));
          return d;
        }
      }

      // Se não houver documento de resumo, busca a contagem agregada rápida de locais via getCountFromServer
      const snap = await getCountFromServer(collection(targetDb, 'locais_votacao'));
      const count = snap.data().count;
      setTotalLocaisCount(count);
      return { totalLocais: count, totalSecoes: 0, totalCapacidade: 0 };
    } catch (err) {
      console.warn('[LocationContext] Erro ao buscar resumo de locais:', err);
      return {
        totalLocais: totalLocaisCount,
        totalSecoes: totalSecoesCount,
        totalCapacidade: totalCapacidadeCount
      };
    }
  }, [activeDb, tenantKey, totalLocaisCount, totalSecoesCount, totalCapacidadeCount]);

  // Consulta contagem total agregada de locais via getCountFromServer (1 leitura rápida)
  const fetchLocaisCount = useCallback(async (): Promise<number> => {
    try {
      const targetDb = activeDb || getActiveDb();
      const snap = await getCountFromServer(collection(targetDb, 'locais_votacao'));
      const count = snap.data().count;
      setTotalLocaisCount(count);
      safeStorage.setItem(`locais_count_${tenantKey}`, String(count));
      return count;
    } catch (err) {
      console.warn('[LocationContext] Erro ao contar locais:', err);
      return totalLocaisCount;
    }
  }, [activeDb, tenantKey, totalLocaisCount]);

  // Busca sob demanda: traz resultados relevantes cobrindo a base inteira quando busca, ou paginação leve quando navega
  const fetchLocaisPage = useCallback(
    async (params?: FetchLocaisParams): Promise<FetchLocaisResult> => {
      const pageSize = params?.pageSize || 100;
      const startAfterDoc = params?.startAfterDoc || null;
      const searchTerm = (params?.searchTerm || '').trim();
      const selectedZona = params?.selectedZona || 'todas';

      setIsLoadingLocais(true);
      try {
        const targetDb = activeDb || getActiveDb();
        const colRef = collection(targetDb, 'locais_votacao');

        // 1. SE TEM TERMO DE BUSCA OU FILTRO DE ZONA: Busca dedicada cobrindo a base inteira
        if (searchTerm || (selectedZona && selectedZona !== 'todas')) {
          const allLocais = await fetchAllLocaisDedicated();
          const matched = allLocais.filter((local) =>
            matchLocalFilter(local, searchTerm, selectedZona)
          );
          matched.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

          setLocais(matched);
          return {
            locais: matched,
            lastDoc: null,
            firstDoc: null,
            hasMore: false,
            totalCount: matched.length
          };
        }

        // 2. Sem termo de busca: paginação padrão leve ordenada por nome
        let q;
        if (startAfterDoc) {
          q = query(colRef, orderBy('nome', 'asc'), startAfter(startAfterDoc), limit(pageSize + 1));
        } else {
          q = query(colRef, orderBy('nome', 'asc'), limit(pageSize + 1));
        }

        const snap = await getDocs(q);
        const docs = snap.docs;
        const hasMore = docs.length > pageSize;
        const returnDocs = hasMore ? docs.slice(0, pageSize) : docs;

        const list: LocalVotacao[] = returnDocs.map((d) => {
          const data = d.data();
          const rawSecoes = Array.isArray(data.secoes)
            ? data.secoes
            : (data.secao ? [data.secao] : (typeof data.secoes === 'string' ? data.secoes.split(',').map((s: string) => s.trim()) : []));
          const cleanSecoes = sanitizeSecoesFromAptosNumbers(
            rawSecoes,
            typeof data.secoesAgregadas === 'string' ? data.secoesAgregadas : undefined
          );
          return {
            id: d.id,
            ...data,
            secoes: cleanSecoes
          } as LocalVotacao;
        });

        setLocais(list);
        setCachedCollection('locais_votacao', list, tenantKey);

        return {
          locais: list,
          lastDoc: returnDocs[returnDocs.length - 1] || null,
          firstDoc: returnDocs[0] || null,
          hasMore
        };
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'locais_votacao', tenantKey);
        return {
          locais: [],
          lastDoc: null,
          firstDoc: null,
          hasMore: false
        };
      } finally {
        setIsLoadingLocais(false);
      }
    },
    [activeDb, tenantKey, fetchAllLocaisDedicated]
  );

  // Recarregar locais explicitamente sob demanda
  const recarregarLocais = useCallback(async () => {
    setIsLoadingLocais(true);
    dedicatedCacheRef.current = null;
    try {
      await fetchResumoStats();
      await fetchLocaisPage({ pageSize: 100 });
    } finally {
      setIsLoadingLocais(false);
    }
  }, [fetchResumoStats, fetchLocaisPage]);

  // Carregamento inicial leve sob demanda (sem onSnapshot de 5000 documentos)
  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    const isCleared = safeStorage.getItem(`locais_cleared_${tenantKey}`) === 'true';
    if (isCleared) {
      setLocais([]);
      setTotalLocaisCount(0);
      setTotalSecoesCount(0);
      setTotalCapacidadeCount(0);
      setIsLoaded(true);
      return;
    }

    if (isCircuitBroken('locais_votacao', tenantKey)) {
      const cached = getCachedCollection<LocalVotacao>('locais_votacao', undefined, tenantKey);
      if (cached?.data && cached.data.length > 0) {
        setLocais(cached.data);
      }
      setIsLoaded(true);
      return;
    }

    let isCurrent = true;
    const loadInitialData = async () => {
      setIsLoadingLocais(true);
      try {
        await fetchResumoStats();
        if (!isCurrent) return;

        const res = await fetchLocaisPage({ pageSize: 100 });
        if (!isCurrent) return;
        if (res.locais.length > 0) {
          setLocais(res.locais);
        }
      } catch (err) {
        console.warn('[LocationContext] Aviso no carregamento inicial sob demanda:', err);
      } finally {
        if (isCurrent) {
          setIsLoadingLocais(false);
          setIsLoaded(true);
        }
      }
    };

    loadInitialData();

    return () => {
      isCurrent = false;
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant, fetchResumoStats, fetchLocaisPage]);

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
      setTotalLocaisCount((p) => p + 1);
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
    setTotalLocaisCount((p) => Math.max(0, p - 1));

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
    setTotalLocaisCount((p) => Math.max(0, p - ids.length));

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

  const clearAllLocais = useCallback(async () => {
    safeStorage.setItem(`locais_cleared_${tenantKey}`, 'true');
    setLocais([]);
    setTotalLocaisCount(0);
    setTotalSecoesCount(0);
    setTotalCapacidadeCount(0);
    setRegisteredPairsList([]);
    dedicatedCacheRef.current = null;
    safeStorage.setItem(`locais_count_${tenantKey}`, '0');
    safeStorage.setItem(`locais_secoes_count_${tenantKey}`, '0');
    safeStorage.setItem(`locais_capacidade_count_${tenantKey}`, '0');
    setCachedCollection('locais_votacao', [], tenantKey);

    let deleted = 0;
    try {
      const targetDb = activeDb || getActiveDb();
      try {
        await deleteDoc(doc(targetDb, 'configuracoes', 'locais_resumo'));
      } catch {}
      const snap = await getDocs(collection(targetDb, 'locais_votacao'));
      const docIds = snap.docs.map((d) => d.id);
      const CHUNK_SIZE = 400;
      for (let i = 0; i < docIds.length; i += CHUNK_SIZE) {
        const chunk = docIds.slice(i, i + CHUNK_SIZE);
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
    return { deleted };
  }, [tenantKey, activeDb]);

  const seedLocaisDefault = useCallback(async () => {
    safeStorage.removeItem(`locais_cleared_${tenantKey}`);
    const presets = LOCAIS_PRESET_DEFAULT.map((p, i) => ({
      id: `seed_${Date.now()}_${i}`,
      ...p,
      dataCadastro: new Date().toISOString()
    }));
    setLocais(presets);
    setTotalLocaisCount(presets.length);
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
      safeStorage.removeItem(`locais_cleared_${tenantKey}`);
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
      if (toCreate.length > 0) {
        setTotalLocaisCount((p) => p + toCreate.length);
      }

      try {
        const targetDb = activeDb || getActiveDb();
        for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
          const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(targetDb, 'locais_votacao', item.id);
            const dadosSanitizados = { ...item.dados };
            if (dadosSanitizados.secoes) {
              dadosSanitizados.secoes = sanitizeSecoesFromAptosNumbers(
                Array.isArray(dadosSanitizados.secoes) ? dadosSanitizados.secoes : [dadosSanitizados.secoes],
                typeof dadosSanitizados.secoesAgregadas === 'string' ? dadosSanitizados.secoesAgregadas : undefined
              );
            }
            batch.update(docRef, sanitizeFirestoreData(dadosSanitizados));
          });
          await batch.commit();
          updated += chunk.length;
        }

        for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
          const chunk = toCreate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((item) => {
            const docRef = doc(collection(targetDb, 'locais_votacao'));
            const cleanSecoes = sanitizeSecoesFromAptosNumbers(
              Array.isArray(item.secoes) ? item.secoes : (item.secoes ? [item.secoes] : []),
              typeof item.secoesAgregadas === 'string' ? item.secoesAgregadas : undefined
            );
            batch.set(docRef, {
              ...sanitizeFirestoreData({ ...item, secoes: cleanSecoes }),
              dataCadastro: serverTimestamp()
            });
          });
          await batch.commit();
          created += chunk.length;
        }
        dedicatedCacheRef.current = null;
        fetchResumoStats().catch(() => {});
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'locais_votacao');
      }

      return { created: created || toCreate.length, updated: updated || toUpdate.length };
    },
    [tenantKey, activeDb, fetchResumoStats]
  );

  const value = useMemo(
    () => ({
      locais,
      totalLocaisCount,
      totalSecoesCount,
      totalCapacidadeCount,
      registeredPairsList,
      isLoaded,
      isLoadingLocais,
      recarregarLocais,
      fetchLocaisPage,
      fetchLocaisCount,
      fetchResumoStats,
      fetchAllLocaisDedicated,
      fetchAllMatchingIds,
      addLocalVotacao,
      updateLocalVotacao,
      deleteLocalVotacao,
      batchDeleteLocais,
      clearAllLocais,
      seedLocaisDefault,
      batchSaveLocais
    }),
    [
      locais,
      totalLocaisCount,
      totalSecoesCount,
      totalCapacidadeCount,
      registeredPairsList,
      isLoaded,
      isLoadingLocais,
      recarregarLocais,
      fetchLocaisPage,
      fetchLocaisCount,
      fetchResumoStats,
      fetchAllLocaisDedicated,
      fetchAllMatchingIds,
      addLocalVotacao,
      updateLocalVotacao,
      deleteLocalVotacao,
      batchDeleteLocais,
      clearAllLocais,
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
