'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType, isCircuitBroken, resetCircuitBreaker } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';

export interface ApuracaoSecao {
  id: string; // ex: "z1_s12"
  zona: string;
  secao: string;
  votosApurados: number;
  dataApuracao: string; // ISO
  apuradoPor?: string;
  boletimUrna?: string;
  observacoes?: string;
}

export function normalizeZona(z?: string): string {
  if (!z) return '';
  const digits = z.replace(/\D/g, '');
  if (digits) return String(parseInt(digits, 10));
  return z.trim().toLowerCase();
}

export function normalizeSecao(s?: string): string {
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits) return String(parseInt(digits, 10));
  return s.trim().toLowerCase();
}

export function makeSecaoKey(zona?: string, secao?: string): string {
  const z = normalizeZona(zona);
  const s = normalizeSecao(secao);
  return `z${z}_s${s}`;
}

export interface ApuracaoProgress {
  current: number;
  total: number;
  percent: number;
  message: string;
}

interface ApuracaoContextType {
  apuracoes: ApuracaoSecao[];
  apuracoesMap: Map<string, ApuracaoSecao>;
  isLoaded: boolean;
  salvarApuracaoSecao: (
    zona: string,
    secao: string,
    votosApurados: number,
    extras?: { boletimUrna?: string; observacoes?: string; dataApuracao?: string }
  ) => Promise<void>;
  removerApuracaoSecao: (zona: string, secao: string) => Promise<void>;
  importarLoteApuracao: (
    itens: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string; observacoes?: string }>,
    onProgress?: (progress: ApuracaoProgress) => void
  ) => Promise<{ imported: number }>;
  limparTodasApuracoes: () => Promise<{ deleted: number }>;
}

const ApuracaoContext = createContext<ApuracaoContextType | undefined>(undefined);

export function ApuracaoProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthReady } = useAuth();
  const { currentTenant, subdomain, isLoadingTenant, activeDb, tenantVersion } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias de persistência local

  const [apuracoes, setApuracoes] = useState<ApuracaoSecao[]>(() => {
    const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', CACHE_TTL_MS, tenantKey);
    return cached?.data || [];
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', CACHE_TTL_MS, tenantKey);
    return !!cached?.data;
  });

  // Atualiza cache seletivo se o tenant ou versão mudar
  useEffect(() => {
    const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', CACHE_TTL_MS, tenantKey);
    if (cached?.data) {
      setApuracoes(cached.data);
      setIsLoaded(true);
    }
  }, [tenantKey, tenantVersion]);

  // Sincronização inicial via API REST para assegurar carregamento imediato entre máquinas diferentes
  useEffect(() => {
    if (!isAuthReady || isLoadingTenant) return;

    let isSubscribed = true;

    async function syncFromRemoteDb() {
      try {
        const queryParams = new URLSearchParams();
        if (currentTenant?.firebaseConfig?.projectId) {
          queryParams.set('projectId', currentTenant.firebaseConfig.projectId);
        }
        if (currentTenant?.firebaseConfig?.firestoreDatabaseId) {
          queryParams.set('databaseId', currentTenant.firebaseConfig.firestoreDatabaseId);
        }
        if (currentTenant?.firebaseConfig?.apiKey) {
          queryParams.set('apiKey', currentTenant.firebaseConfig.apiKey);
        }

        const res = await fetch(`/api/apuracao/batch?${queryParams.toString()}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.apuracoes) && json.apuracoes.length > 0) {
            if (!isSubscribed) return;
            setApuracoes((prev) => {
              // Mescla de forma inteligente preservando a versão mais recente
              const map = new Map<string, ApuracaoSecao>();
              prev.forEach((p) => map.set(p.id, p));
              json.apuracoes.forEach((d: any) => {
                map.set(d.id, {
                  id: d.id,
                  zona: d.zona || '',
                  secao: d.secao || '',
                  votosApurados: typeof d.votosApurados === 'number' ? d.votosApurados : Number(d.votosApurados || 0),
                  dataApuracao: d.dataApuracao || new Date().toISOString(),
                  apuradoPor: d.apuradoPor || '',
                  boletimUrna: d.boletimUrna || '',
                  observacoes: d.observacoes || ''
                });
              });
              const merged = Array.from(map.values());
              setCachedCollection('apuracao_secoes', merged, tenantKey);
              return merged;
            });
            setIsLoaded(true);
          }
        }
      } catch (e) {
        console.warn('[ApuracaoContext] Sincronização secundária REST falhou:', e);
      }
    }

    syncFromRemoteDb();

    return () => {
      isSubscribed = false;
    };
  }, [isAuthReady, isLoadingTenant, tenantKey, currentTenant?.firebaseConfig?.projectId]);

  // Snapshot em tempo real com Firestore ativo
  useEffect(() => {
    if (!isAuthReady || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('apuracao_secoes', tenantKey)) {
      const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', CACHE_TTL_MS, tenantKey);
      if (cached?.data) {
        setApuracoes(cached.data);
        setIsLoaded(true);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const colRef = collection(targetDb, 'apuracao_secoes');

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: ApuracaoSecao[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as any;
          list.push({
            id: docSnap.id,
            zona: d.zona || '',
            secao: d.secao || '',
            votosApurados: typeof d.votosApurados === 'number' ? d.votosApurados : Number(d.votosApurados || 0),
            dataApuracao: d.dataApuracao || new Date().toISOString(),
            apuradoPor: d.apuradoPor || '',
            boletimUrna: d.boletimUrna || '',
            observacoes: d.observacoes || ''
          });
        });

        if (list.length > 0) {
          setApuracoes(list);
          setCachedCollection('apuracao_secoes', list, tenantKey);
        }
        setIsLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'apuracao_secoes', tenantKey);
        const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', CACHE_TTL_MS, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setApuracoes(cached.data);
        }
        setIsLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [isAuthReady, isLoadingTenant, activeDb, tenantKey]);

  // Mapa rápido indexado por chave normalizada
  const apuracoesMap = useMemo(() => {
    const map = new Map<string, ApuracaoSecao>();
    apuracoes.forEach((item) => {
      const key = makeSecaoKey(item.zona, item.secao);
      map.set(key, item);
      map.set(item.id, item);
    });
    return map;
  }, [apuracoes]);

  // Salvar ou atualizar apuração de uma seção
  const salvarApuracaoSecao = useCallback(
    async (
      zona: string,
      secao: string,
      votosApurados: number,
      extras?: { boletimUrna?: string; observacoes?: string; dataApuracao?: string }
    ) => {
      const key = makeSecaoKey(zona, secao);
      const operador = currentUser?.nome || currentUser?.email || 'Coordenação';
      const nowIso = extras?.dataApuracao || new Date().toISOString();

      const docPayload: ApuracaoSecao = {
        id: key,
        zona: String(zona || '').trim(),
        secao: String(secao || '').trim(),
        votosApurados: Number.isFinite(votosApurados) ? Math.max(0, Math.round(votosApurados)) : 0,
        dataApuracao: nowIso,
        apuradoPor: operador,
        boletimUrna: extras?.boletimUrna ? String(extras.boletimUrna).trim() : '',
        observacoes: extras?.observacoes ? String(extras.observacoes).trim() : ''
      };

      // Atualização otimista imediata na interface
      setApuracoes((prev) => {
        const filtered = prev.filter((p) => p.id !== key);
        const updated = [...filtered, docPayload];
        setCachedCollection('apuracao_secoes', updated, tenantKey);
        return updated;
      });

      // 1. Gravação direta no Firestore via API REST garantida (acessível por qualquer máquina)
      const restPromise = fetch('/api/apuracao/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [docPayload],
          firebaseConfig: currentTenant?.firebaseConfig
        })
      }).catch((err) => {
        console.warn('[ApuracaoContext] Falha no fallback REST:', err);
      });

      // 2. Gravação no SDK local caso disponível
      try {
        const targetDb = activeDb || getActiveDb();
        await setDoc(doc(targetDb, 'apuracao_secoes', key), docPayload);
        resetCircuitBreaker('apuracao_secoes', tenantKey);
      } catch (err) {
        console.warn(`[ApuracaoContext] SDK Firestore offline/aviso para seção ${key}, assegurando via REST:`, err);
        await restPromise;
      }
    },
    [currentUser, activeDb, tenantKey, currentTenant?.firebaseConfig]
  );

  // Remover apuração de uma seção
  const removerApuracaoSecao = useCallback(
    async (zona: string, secao: string) => {
      const key = makeSecaoKey(zona, secao);

      // Atualização otimista
      setApuracoes((prev) => {
        const updated = prev.filter((p) => p.id !== key);
        setCachedCollection('apuracao_secoes', updated, tenantKey);
        return updated;
      });

      // Exclusão via REST
      fetch('/api/apuracao/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [key],
          firebaseConfig: currentTenant?.firebaseConfig
        })
      }).catch(() => {});

      try {
        const targetDb = activeDb || getActiveDb();
        await deleteDoc(doc(targetDb, 'apuracao_secoes', key));
      } catch (err) {
        console.warn(`[ApuracaoContext] Aviso ao remover no SDK:`, err);
      }
    },
    [activeDb, tenantKey, currentTenant?.firebaseConfig]
  );

  // Importar lote de apurações com gravação real e atômica no Firestore
  const importarLoteApuracao = useCallback(
    async (
      itens: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string; observacoes?: string }>,
      onProgress?: (progress: ApuracaoProgress) => void
    ) => {
      const operador = currentUser?.nome || currentUser?.email || 'Coordenação';
      const nowIso = new Date().toISOString();
      const totalItens = itens.length;

      onProgress?.({
        current: 0,
        total: totalItens,
        percent: 5,
        message: `Iniciando gravação de ${totalItens} seções no banco de dados...`
      });

      const newDocs: ApuracaoSecao[] = itens.map((item) => {
        const key = makeSecaoKey(item.zona, item.secao);
        return {
          id: key,
          zona: String(item.zona || '').trim(),
          secao: String(item.secao || '').trim(),
          votosApurados: Number.isFinite(item.votosApurados) ? Math.max(0, Math.round(item.votosApurados)) : 0,
          dataApuracao: nowIso,
          apuradoPor: operador,
          boletimUrna: item.boletimUrna ? String(item.boletimUrna).trim() : '',
          observacoes: item.observacoes ? String(item.observacoes).trim() : 'Importação em lote pós-eleição'
        };
      });

      // Atualização otimista local
      setApuracoes((prev) => {
        const map = new Map<string, ApuracaoSecao>();
        prev.forEach((p) => map.set(p.id, p));
        newDocs.forEach((d) => map.set(d.id, d));
        const updated = Array.from(map.values());
        setCachedCollection('apuracao_secoes', updated, tenantKey);
        return updated;
      });

      // Limpa circuit breaker pré-existente
      resetCircuitBreaker('apuracao_secoes', tenantKey);

      onProgress?.({
        current: Math.round(totalItens * 0.1),
        total: totalItens,
        percent: 12,
        message: 'Conectando ao banco Firestore na nuvem...'
      });

      // Gravação em blocos para exibir progresso realista e garantir persistência robusta
      const BATCH_SIZE = 200;
      let processed = 0;

      for (let i = 0; i < newDocs.length; i += BATCH_SIZE) {
        const chunk = newDocs.slice(i, i + BATCH_SIZE);
        const percent = Math.min(94, Math.round(((i + chunk.length) / totalItens) * 80) + 12);

        onProgress?.({
          current: Math.min(i + chunk.length, totalItens),
          total: totalItens,
          percent,
          message: `Gravando seções ${i + 1} a ${Math.min(i + chunk.length, totalItens)} de ${totalItens} no banco...`
        });

        try {
          const res = await fetch('/api/apuracao/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: chunk,
              firebaseConfig: currentTenant?.firebaseConfig
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Erro HTTP ${res.status} ao persistir lote.`);
          }
        } catch (restErr) {
          console.warn('[ApuracaoContext] Falha no REST primário, tentando fallback via SDK direto:', restErr);
          // Fallback secundário no SDK do cliente
          try {
            const targetDb = activeDb || getActiveDb();
            const batch = writeBatch(targetDb);
            chunk.forEach((d) => {
              batch.set(doc(targetDb, 'apuracao_secoes', d.id), d);
            });
            await batch.commit();
          } catch (sdkErr) {
            console.error('[ApuracaoContext] Erro ao persistir lote no Firestore:', sdkErr);
            handleFirestoreError(sdkErr, OperationType.UPDATE, 'apuracao_secoes', tenantKey);
            throw sdkErr;
          }
        }
        processed += chunk.length;
      }

      // Sincroniza também no SDK do cliente em segundo plano para refletir no cache local imediato
      try {
        const targetDb = activeDb || getActiveDb();
        const CHUNK_SIZE = 400;
        for (let i = 0; i < newDocs.length; i += CHUNK_SIZE) {
          const chunk = newDocs.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(targetDb);
          chunk.forEach((d) => {
            batch.set(doc(targetDb, 'apuracao_secoes', d.id), d);
          });
          await batch.commit();
        }
      } catch {}

      onProgress?.({
        current: totalItens,
        total: totalItens,
        percent: 100,
        message: `✓ Concluído com sucesso! ${totalItens} seções gravadas no banco de dados.`
      });

      return { imported: newDocs.length };
    },
    [currentUser, activeDb, tenantKey, currentTenant?.firebaseConfig]
  );

  // Excluir todos os votos cadastrados / apurações importadas
  const limparTodasApuracoes = useCallback(async () => {
    const count = apuracoes.length;

    // Atualização otimista imediata
    setApuracoes([]);
    setCachedCollection('apuracao_secoes', [], tenantKey);

    // 1. Limpeza garantida no Firestore via servidor
    try {
      await fetch('/api/apuracao/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseConfig: currentTenant?.firebaseConfig
        })
      });
    } catch (e) {
      console.warn('[ApuracaoContext] Erro ao limpar via REST:', e);
    }

    // 2. Limpeza no SDK local
    try {
      const targetDb = activeDb || getActiveDb();
      const snap = await getDocs(collection(targetDb, 'apuracao_secoes'));
      const CHUNK_SIZE = 400;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(targetDb);
        chunk.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }
      resetCircuitBreaker('apuracao_secoes', tenantKey);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'apuracao_secoes', tenantKey);
    }

    return { deleted: count };
  }, [activeDb, apuracoes.length, tenantKey, currentTenant?.firebaseConfig]);


  const value = useMemo(
    () => ({
      apuracoes,
      apuracoesMap,
      isLoaded,
      salvarApuracaoSecao,
      removerApuracaoSecao,
      importarLoteApuracao,
      limparTodasApuracoes
    }),
    [apuracoes, apuracoesMap, isLoaded, salvarApuracaoSecao, removerApuracaoSecao, importarLoteApuracao, limparTodasApuracoes]
  );

  return <ApuracaoContext.Provider value={value}>{children}</ApuracaoContext.Provider>;
}

export function useApuracao() {
  const context = useContext(ApuracaoContext);
  if (!context) {
    throw new Error('useApuracao deve ser usado dentro de um ApuracaoProvider');
  }
  return context;
}
