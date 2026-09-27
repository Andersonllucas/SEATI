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
import { Vote } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { currentUser, isLoading, isAuthReady } = useAuth();
  const { tenantError, isLoadingTenant, resetToDefaultTenant, isAdminMaster } = useTenant();

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

  // Rota do painel master ou tela de erro de subdomínio renderiza diretamente sem o layout de campanha
  if (isAdminMasterPath || isTenantErrorPath || isAdminMaster) {
    return <>{children}</>;
  }

  // Se o subdomínio não existe ou está inativo, exibe a mensagem de erro do tenant
  if (tenantError && !isLoadingTenant) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-container-low border border-outline-variant/60 rounded-2xl p-6 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 mx-auto flex items-center justify-center">
            <Vote className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-on-surface">
            {tenantError.reason === 'inactive' ? 'Ambiente Desativado' : 'Ambiente Não Localizado'}
          </h2>
          <p className="text-xs text-on-surface-variant">{tenantError.message}</p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={resetToDefaultTenant}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Restaurar Campanha Padrão
            </button>
            <a
              href="/admin-master"
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-outline-variant/60 text-xs font-semibold hover:bg-surface-container transition-colors text-on-surface"
            >
              Acessar Painel Master
            </a>
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
    <div className="flex h-screen overflow-hidden bg-background">
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

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Topbar onMenuClick={handleOpenMenu} />
        <QuotaWarningBanner />
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
      <MasterPasswordModal />
      <ToastContainer />
      <NotificationDrawer />
    </div>
  );
}
