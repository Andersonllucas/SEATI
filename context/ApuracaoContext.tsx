'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { handleFirestoreError, OperationType } from '@/lib/firestoreErrors';
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
    itens: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string }>
  ) => Promise<{ imported: number }>;
}

const ApuracaoContext = createContext<ApuracaoContextType | undefined>(undefined);

export function ApuracaoProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { currentTenant, subdomain, activeDb } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  const [apuracoes, setApuracoes] = useState<ApuracaoSecao[]>(() => {
    const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', undefined, tenantKey);
    return cached?.data || [];
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    const cached = getCachedCollection<ApuracaoSecao>('apuracao_secoes', undefined, tenantKey);
    return !!cached?.data;
  });

  // Snapshot em tempo real com Firestore
  useEffect(() => {
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

        setApuracoes(list);
        setCachedCollection('apuracao_secoes', list, tenantKey);
        setIsLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'apuracao_secoes');
        setIsLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [activeDb, tenantKey]);

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
        zona: zona.trim(),
        secao: secao.trim(),
        votosApurados: Math.max(0, votosApurados),
        dataApuracao: nowIso,
        apuradoPor: operador,
        boletimUrna: extras?.boletimUrna?.trim() || '',
        observacoes: extras?.observacoes?.trim() || ''
      };

      // Atualização otimista
      setApuracoes((prev) => {
        const filtered = prev.filter((p) => p.id !== key);
        const updated = [...filtered, docPayload];
        setCachedCollection('apuracao_secoes', updated, tenantKey);
        return updated;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        await setDoc(doc(targetDb, 'apuracao_secoes', key), docPayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `apuracao_secoes/${key}`);
      }
    },
    [currentUser, activeDb, tenantKey]
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

      try {
        const targetDb = activeDb || getActiveDb();
        await deleteDoc(doc(targetDb, 'apuracao_secoes', key));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `apuracao_secoes/${key}`);
      }
    },
    [activeDb, tenantKey]
  );

  // Importar lote de apurações
  const importarLoteApuracao = useCallback(
    async (itens: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string }>) => {
      const operador = currentUser?.nome || currentUser?.email || 'Coordenação';
      const nowIso = new Date().toISOString();

      const newDocs: ApuracaoSecao[] = itens.map((item) => {
        const key = makeSecaoKey(item.zona, item.secao);
        return {
          id: key,
          zona: item.zona.trim(),
          secao: item.secao.trim(),
          votosApurados: Math.max(0, item.votosApurados),
          dataApuracao: nowIso,
          apuradoPor: operador,
          boletimUrna: item.boletimUrna || '',
          observacoes: 'Importação em lote pós-eleição'
        };
      });

      // Atualização otimista
      setApuracoes((prev) => {
        const map = new Map<string, ApuracaoSecao>();
        prev.forEach((p) => map.set(p.id, p));
        newDocs.forEach((d) => map.set(d.id, d));
        const updated = Array.from(map.values());
        setCachedCollection('apuracao_secoes', updated, tenantKey);
        return updated;
      });

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
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'apuracao_secoes');
      }

      return { imported: newDocs.length };
    },
    [currentUser, activeDb, tenantKey]
  );

  const value = useMemo(
    () => ({
      apuracoes,
      apuracoesMap,
      isLoaded,
      salvarApuracaoSecao,
      removerApuracaoSecao,
      importarLoteApuracao
    }),
    [apuracoes, apuracoesMap, isLoaded, salvarApuracaoSecao, removerApuracaoSecao, importarLoteApuracao]
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
