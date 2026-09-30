'use client';

import React, { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { MasterPasswordModal } from './MasterPasswordModal';
import { LoginView } from './LoginView';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { ToastContainer } from './ToastContainer';
import { NotificationDrawer } from './NotificationDrawer';
import { PasswordChangePromptModal } from './PasswordChangePromptModal';
import { MasterImpersonationBanner } from './MasterImpersonationBanner';
import { Vote, LogOut, ShieldAlert } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { currentUser, isLoading, isAuthReady, logout } = useAuth();
  const { tenantError, isLoadingTenant, isAdminMaster, subdomain } = useTenant();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Register PWA Service Worker
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] Service worker registration error:', err);
      });
    }
  }, []);

  const handleOpenMenu = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const isLoginPage = pathname === '/login';
  const isAdminMasterPath = pathname?.startsWith('/admin-master');
  const isTenantErrorPath = pathname?.startsWith('/tenant-error');
  // Se estiver no domínio master, em rota /admin-master ou com subdomínio 'admin', isola 100%
  const isMaster = isAdminMaster || subdomain === 'admin' || isAdminMasterPath;
  const isPublicRegistrationPath =
    pathname === '/cadastro-externo' ||
    pathname?.startsWith('/cadastro-externo/') ||
    pathname === '/campo' ||
    pathname?.startsWith('/campo/');

  // 1. Rotas de cadastro externo para equipe de campo (sem autenticação, isoladas do painel administrativo)
  if (isPublicRegistrationPath) {
    return (
      <div className="min-h-screen bg-surface-container-lowest">
        {children}
        <ToastContainer />
      </div>
    );
  }

  // 2. ROTA EXCLUSIVA DO PAINEL MASTER OU TELA DE ERRO (100% ISOLADAS DO SISTEMA DE CAMPANHA)
  // O painel master roda de forma totalmente autônoma, sem barra lateral de campanha, topo ou login de eleitores
  if (isMaster || isTenantErrorPath) {
    return <>{children}</>;
  }

  // Se o subdomínio não existe ou está inativo, exibe a mensagem de erro do tenant
  if (tenantError && !isLoadingTenant) {
    const isInactive = tenantError.reason === 'inactive';

    const handleExit = async () => {
      try {
        await logout();
      } catch {}
      if (typeof window !== 'undefined') {
        localStorage.removeItem('adti_active_subdomain');
        localStorage.removeItem('seati_active_subdomain');
        localStorage.removeItem('gestao_eleitoral_user_id');
        localStorage.removeItem('gestao_eleitoral_cached_user');
        sessionStorage.removeItem('adti_admin_master_user');
        document.cookie = 'adti_subdomain=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        window.location.href = '/login';
      }
    };

    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-container-low border border-outline-variant/60 rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 mx-auto flex items-center justify-center shadow-inner">
            {isInactive ? <ShieldAlert className="w-7 h-7 text-amber-600" /> : <Vote className="w-7 h-7" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold font-display text-on-surface">
              {isInactive ? 'Acesso Suspenso' : 'Ambiente Não Localizado'}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {isInactive
                ? 'Acesso suspenso, contate o administrador.'
                : tenantError.message}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center">
            {isInactive ? (
              <button
                type="button"
                onClick={handleExit}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair / Encerrar Sessão</span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                <button
                  type="button"
                  onClick={handleExit}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </button>
                <a
                  href="/admin-master"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  Acessar Painel Master
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state while verifying authentication or client hydration
  if (!mounted || isLoading || !isAuthReady) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-xl shadow-primary/20 animate-pulse">
            <Vote className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white tracking-wide">SEATI</p>
            <p className="text-xs text-slate-400">Iniciando ambiente seguro...</p>
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated or explicitly on /login, render the LoginView directly
  if (!currentUser || isLoginPage) {
    return <LoginView />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Banner de Modo Suporte Master quando acessando campanha de cliente */}
      <MasterImpersonationBanner />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={handleCloseMenu}
          />
        )}

        {/* Persistent Sidebar */}
        <div 
          className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar onNavigate={handleCloseMenu} />
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <Topbar onMenuClick={handleOpenMenu} />
          <QuotaWarningBanner />
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {children}
          </main>
        </div>
        <MasterPasswordModal />
        <PasswordChangePromptModal />
        <ToastContainer />
        <NotificationDrawer />
      </div>
    </div>
  );
}
