'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TenantClient } from '@/lib/tenantTypes';
import { setActiveTenant, getActiveDb, getActiveAuth, getActiveApp, getCentralDb } from '@/lib/firebase';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';
import { Firestore, doc, onSnapshot } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { FirebaseApp } from 'firebase/app';
import { safeStorage } from '@/lib/safeStorage';

interface TenantContextType {
  currentTenant: TenantClient | null;
  subdomain: string;
  isLoadingTenant: boolean;
  tenantError: { reason: string; message: string; subdomain: string } | null;
  isAdminMaster: boolean;
  activeDb: Firestore;
  activeAuth: Auth;
  activeApp: FirebaseApp;
  tenantVersion: number;
  setTenantError: (err: { reason: string; message: string; subdomain: string } | null) => void;
  suspendTenant: (sub?: string) => void;
  setManualSubdomain: (subdomain: string) => void;
  switchToTenant: (subdomain: string) => void;
  reloadTenant: () => Promise<void>;
  resetToDefaultTenant: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({
  children,
  initialSubdomain,
  initialIsAdminMaster
}: {
  children: React.ReactNode;
  initialSubdomain?: string;
  initialIsAdminMaster?: boolean;
}) {
  const [subdomain, setSubdomain] = useState<string>(initialSubdomain || '');
  const [isAdminMaster, setIsAdminMaster] = useState<boolean>(initialIsAdminMaster || false);
  const [currentTenant, setCurrentTenant] = useState<TenantClient | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState<boolean>(!initialIsAdminMaster);
  const [tenantError, setTenantError] = useState<{ reason: string; message: string; subdomain: string } | null>(null);
  const [tenantVersion, setTenantVersion] = useState<number>(0);

  // 1. Detecta o subdomínio e tipo de domínio a partir do ambiente do navegador
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname.toLowerCase().trim();
    const searchParams = new URLSearchParams(window.location.search);
    const querySubdomain = searchParams.get('subdomain');

    // 1. Prioridade máxima: Subdomínio explícito na query string (?subdomain=...)
    if (querySubdomain) {
      const cleanSub = querySubdomain.toLowerCase().trim();
      if (cleanSub === 'admin') {
        setIsAdminMaster(true);
        setSubdomain('admin');
        setIsLoadingTenant(false);
        return;
      } else {
        setIsAdminMaster(false);
        setSubdomain(cleanSub);
        safeStorage.setItem('adti_active_subdomain', cleanSub);
        try { document.cookie = `adti_subdomain=${cleanSub}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
        return;
      }
    }

    // 2. Domínio mestre ou rota /admin-master sem parâmetro explícito de cliente
    if (
      hostname === 'admin.adti.app.br' ||
      window.location.pathname.startsWith('/admin-master')
    ) {
      setIsAdminMaster(true);
      setSubdomain('admin');
      setIsLoadingTenant(false);
      return;
    }

    // Subdomínio sob adti.app.br
    if (hostname.endsWith('.adti.app.br')) {
      const parts = hostname.split('.');
      const firstLabel = parts[0].toLowerCase();
      if (firstLabel === 'admin') {
        setIsAdminMaster(true);
        setSubdomain('admin');
        setIsLoadingTenant(false);
        return;
      } else {
        setSubdomain(firstLabel);
        return;
      }
    }

    // Ambiente de desenvolvimento local ou Preview Cloud Run (ex: ais-dev-...run.app)
    if (querySubdomain) {
      const cleanSub = querySubdomain.toLowerCase().trim();
      setSubdomain(cleanSub);
      safeStorage.setItem('adti_active_subdomain', cleanSub);
      try { document.cookie = `adti_subdomain=${cleanSub}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
      return;
    }

    // Caso padrão de fallback para desenvolvimento/preview
    const getCookie = (name: string) => {
      try {
        if (typeof document === 'undefined') return null;
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
      } catch {
        return null;
      }
    };
    const cookieSub = getCookie('adti_subdomain');
    const saved = (cookieSub && cookieSub !== 'admin' ? cookieSub : null) || 
                  safeStorage.getItem('adti_active_subdomain') || 
                  safeStorage.getItem('seati_active_subdomain');

    if (saved && saved !== 'admin') {
      setSubdomain(saved);
    } else {
      // Se estiver na rota /admin-master, marca como admin
      if (window.location.pathname.startsWith('/admin-master')) {
        setIsAdminMaster(true);
        setSubdomain('admin');
        setIsLoadingTenant(false);
      } else {
        // Fallback para subdomínio de demonstração
        setSubdomain('demo');
      }
    }
  }, []);

  // 2. Resolve o tenant no clientes_registry a partir do subdomínio
  const resolveTenant = useCallback(async (targetSubdomain: string) => {
    if (!targetSubdomain) return;

    if (targetSubdomain === 'admin') {
      setIsAdminMaster(true);
      setIsLoadingTenant(false);
      return;
    }

    setIsLoadingTenant(true);
    setTenantError(null);

    try {
      const response = await fetch(`/api/tenant/resolve?subdomain=${encodeURIComponent(targetSubdomain)}`, {
        cache: 'no-store'
      });
      const data = await response.json();

      if (data.isAdminDomain) {
        setIsAdminMaster(true);
        setIsLoadingTenant(false);
        return;
      }

      if (data.success && data.client) {
        const client: TenantClient = data.client;
        
        // Ativa o bundle do Firebase correspondente para este cliente
        setActiveTenant(client.subdominio, client.firebaseConfig);
        setCurrentTenant(client);
        setTenantVersion((v) => v + 1);
        setTenantError(null);
        safeStorage.setItem('adti_active_subdomain', client.subdominio);
        try { document.cookie = `adti_subdomain=${client.subdominio}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
      } else {
        // Cliente não encontrado ou inativo
        setTenantError({
          reason: data.reason || 'not_found',
          message: data.message || `Subdomínio "${targetSubdomain}" não pôde ser ativado.`,
          subdomain: targetSubdomain
        });
        setCurrentTenant(null);
      }
    } catch (err: any) {
      console.warn('Falha na requisição de resolver tenant, ativando fallback resiliente:', err);
      // Em caso de erro de rede ou falha na rota /api/tenant/resolve, utiliza fallback seguro
      const fallbackTenant: TenantClient = {
        id: targetSubdomain || 'demo',
        subdominio: targetSubdomain || 'demo',
        nome: targetSubdomain && targetSubdomain !== 'demo' ? `Campanha ${targetSubdomain}` : 'Campanha Teresina (Demonstração)',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG
      };
      setActiveTenant(fallbackTenant.subdominio, fallbackTenant.firebaseConfig);
      setCurrentTenant(fallbackTenant);
      setTenantVersion((v) => v + 1);
    } finally {
      setIsLoadingTenant(false);
    }
  }, []);

  useEffect(() => {
    if (subdomain && subdomain !== 'admin') {
      resolveTenant(subdomain);
    }
  }, [subdomain, resolveTenant]);

  // Monitoramento em tempo real do status do cliente no clientes_registry (banco central)
  // Garante que, ao ativar ou desativar no Admin Master, a tela de login ou erro reflita imediatamente
  useEffect(() => {
    if (!subdomain || subdomain === 'admin' || subdomain === 'demo' || subdomain === 'preview') {
      return;
    }

    let isListenerActive = true;
    try {
      const centralDb = getCentralDb();
      const docRef = doc(centralDb, 'clientes_registry', subdomain);

      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (!isListenerActive) return;

          if (snapshot.exists()) {
            const data = snapshot.data();
            const rawStatus = (data.status || '').toString().trim().toLowerCase();

            if (rawStatus === 'ativo') {
              // Cliente foi reativado no Admin Master! Limpa o erro e reativa o bundle
              setTenantError(null);
              const restoredClient: TenantClient = {
                id: snapshot.id,
                subdominio: data.subdominio || subdomain,
                nome: data.nome || `Campanha ${subdomain}`,
                status: 'ativo',
                firebaseConfig: data.firebaseConfig || CENTRAL_FIREBASE_CONFIG
              };
              setActiveTenant(restoredClient.subdominio, restoredClient.firebaseConfig);
              setCurrentTenant(restoredClient);
              setTenantVersion((v) => v + 1);

              safeStorage.setItem('adti_active_subdomain', restoredClient.subdominio);
              try { document.cookie = `adti_subdomain=${restoredClient.subdominio}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
              // Se estava na tela de erro de suspensão, redireciona para o login
              if (typeof window !== 'undefined' && window.location.pathname === '/tenant-error') {
                window.location.href = '/login';
              }
            } else if (rawStatus === 'inativo') {
              // Cliente foi suspenso
              setTenantError({
                reason: 'inactive',
                message: `O acesso para "${data.nome || subdomain}" está temporariamente inativo.`,
                subdomain
              });
              setCurrentTenant(null);
            }
          }
        },
        (error) => {
          console.warn('[TenantContext] Aviso no listener de sincronização de status:', error);
        }
      );

      return () => {
        isListenerActive = false;
        unsubscribe();
      };
    } catch (err) {
      console.warn('[TenantContext] Não foi possível vincular listener do Firestore central:', err);
    }
  }, [subdomain]);

  const setManualSubdomain = (newSub: string) => {
    const cleaned = newSub.trim().toLowerCase();
    safeStorage.setItem('adti_active_subdomain', cleaned);
    try { document.cookie = `adti_subdomain=${cleaned}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
    if (typeof window !== 'undefined') {
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('subdomain', cleaned);
      window.location.href = targetUrl.toString();
    }
  };

  const switchToTenant = useCallback((newSub: string) => {
    const cleaned = newSub.trim().toLowerCase();
    safeStorage.setItem('adti_active_subdomain', cleaned);
    try { document.cookie = `adti_subdomain=${cleaned}; path=/; max-age=31536000; SameSite=Lax`; } catch {}

    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase().trim();
      if (hostname.endsWith('.adti.app.br')) {
        window.location.href = `https://${cleaned}.adti.app.br/`;
        return;
      }

      window.location.href = `/?subdomain=${encodeURIComponent(cleaned)}`;
    }
  }, []);

  const reloadTenant = async () => {
    if (subdomain) {
      await resolveTenant(subdomain);
    }
  };

  const resetToDefaultTenant = useCallback(() => {
    // Se o cliente estiver desativado ou com acesso suspenso, não permite reabrir o banco central/demo
    if (tenantError?.reason === 'inactive' || currentTenant?.status === 'inativo') {
      console.warn('Tentativa de restaurar campanha padrão bloqueada: acesso do cliente suspenso.');
      return;
    }
    safeStorage.removeItem('seati_active_subdomain');
    safeStorage.removeItem('adti_active_subdomain');
    try { document.cookie = 'adti_subdomain=demo; path=/; max-age=31536000; SameSite=Lax'; } catch {}
    setTenantError(null);
    setSubdomain('demo');
  }, [tenantError, currentTenant]);

  const suspendTenant = useCallback((sub?: string) => {
    const targetSub = sub || subdomain;
    setTenantError({
      reason: 'inactive',
      message: 'Acesso suspenso, contate o administrador.',
      subdomain: targetSub
    });
    setCurrentTenant(null);
  }, [subdomain]);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        subdomain,
        isLoadingTenant,
        tenantError,
        isAdminMaster,
        activeDb: getActiveDb(),
        activeAuth: getActiveAuth(),
        activeApp: getActiveApp(),
        tenantVersion,
        setTenantError,
        suspendTenant,
        setManualSubdomain,
        switchToTenant,
        reloadTenant,
        resetToDefaultTenant
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant deve ser utilizado dentro de um TenantProvider');
  }
  return context;
}
