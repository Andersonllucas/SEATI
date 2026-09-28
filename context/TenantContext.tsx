'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TenantClient } from '@/lib/tenantTypes';
import { setActiveTenant, getActiveDb, getActiveAuth, getActiveApp } from '@/lib/firebase';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { FirebaseApp } from 'firebase/app';

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

    // Domínio mestre
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
      localStorage.setItem('adti_active_subdomain', cleanSub);
      document.cookie = `adti_subdomain=${cleanSub}; path=/; max-age=31536000; SameSite=Lax`;
      return;
    }

    // Caso padrão de fallback para desenvolvimento/preview
    const getCookie = (name: string) => {
      if (typeof document === 'undefined') return null;
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    };
    const cookieSub = getCookie('adti_subdomain');
    const saved = (cookieSub && cookieSub !== 'admin' ? cookieSub : null) || 
                  localStorage.getItem('adti_active_subdomain') || 
                  localStorage.getItem('seati_active_subdomain');

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
      const response = await fetch(`/api/tenant/resolve?subdomain=${encodeURIComponent(targetSubdomain)}`);
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
        if (typeof window !== 'undefined') {
          localStorage.setItem('adti_active_subdomain', client.subdominio);
          document.cookie = `adti_subdomain=${client.subdominio}; path=/; max-age=31536000; SameSite=Lax`;
        }
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
      console.error('Falha ao resolver tenant:', err);
      // Em caso de erro de rede ou offline no ambiente de teste, utiliza fallback seguro
      if (targetSubdomain === 'demo' || targetSubdomain === 'preview') {
        const fallbackTenant: TenantClient = {
          id: targetSubdomain,
          subdominio: targetSubdomain,
          nome: 'Campanha Teresina (Demonstração)',
          status: 'ativo',
          firebaseConfig: CENTRAL_FIREBASE_CONFIG
        };
        setActiveTenant(fallbackTenant.subdominio, fallbackTenant.firebaseConfig);
        setCurrentTenant(fallbackTenant);
        setTenantVersion((v) => v + 1);
      } else {
        setTenantError({
          reason: 'error',
          message: 'Não foi possível conectar ao registro de clientes. Verifique sua conexão.',
          subdomain: targetSubdomain
        });
      }
    } finally {
      setIsLoadingTenant(false);
    }
  }, []);

  useEffect(() => {
    if (subdomain && subdomain !== 'admin') {
      resolveTenant(subdomain);
    }
  }, [subdomain, resolveTenant]);

  const setManualSubdomain = (newSub: string) => {
    const cleaned = newSub.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      localStorage.setItem('adti_active_subdomain', cleaned);
      document.cookie = `adti_subdomain=${cleaned}; path=/; max-age=31536000; SameSite=Lax`;
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('subdomain', cleaned);
      window.location.href = targetUrl.toString();
    }
  };

  const switchToTenant = useCallback((newSub: string) => {
    const cleaned = newSub.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      localStorage.setItem('adti_active_subdomain', cleaned);
      document.cookie = `adti_subdomain=${cleaned}; path=/; max-age=31536000; SameSite=Lax`;
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('subdomain', cleaned);
      window.location.href = targetUrl.toString();
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('seati_active_subdomain');
      localStorage.removeItem('adti_active_subdomain');
      document.cookie = 'adti_subdomain=demo; path=/; max-age=31536000; SameSite=Lax';
    }
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
