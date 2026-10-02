'use client';

import React, { useState, useEffect } from 'react';
import { ShieldAlert, ArrowLeft, Database, RefreshCw } from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { safeStorage } from '@/lib/safeStorage';

export function MasterImpersonationBanner() {
  const { currentTenant, subdomain, reloadTenant } = useTenant();
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [isExiting, setIsExiting] = useState<boolean>(false);

  useEffect(() => {
    try {
      const impSub = safeStorage.getItem('adti_impersonating_tenant');
      const hasMasterUser = !!safeStorage.getItem('adti_admin_master_user');
      if (impSub && (impSub === subdomain || hasMasterUser)) {
        setIsImpersonating(true);
      } else {
        setIsImpersonating(false);
      }
    } catch {
      setIsImpersonating(false);
    }
  }, [subdomain]);

  if (!isImpersonating || subdomain === 'admin') {
    return null;
  }

  const handleReturnToMaster = () => {
    setIsExiting(true);
    safeStorage.removeItem('adti_impersonating_tenant');
    safeStorage.removeItem('adti_impersonating_client');
    safeStorage.setItem('adti_active_subdomain', 'admin');
    try {
      document.cookie = 'adti_subdomain=admin; path=/; max-age=31536000; SameSite=Lax';
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = '/admin-master';
    }
  };

  const clientName = currentTenant?.nome || `Campanha ${subdomain}`;
  const projectId = currentTenant?.firebaseConfig?.projectId || 'Banco Local/Central';

  return (
    <aside aria-label="Aviso de Modo Master" className="w-full bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-500/30 text-white px-3 sm:px-4 py-2 text-xs shadow-md z-[9999] relative">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Info do cliente e banco ativo */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold uppercase text-[10px] tracking-wider border border-indigo-500/30 shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Modo Suporte Master</span>
          </div>

          <div className="flex items-center gap-2 text-xs truncate">
            <span className="text-white/90">
              Campanha Ativa: <strong className="text-white font-bold">{clientName}</strong>{' '}
              <span className="text-indigo-300 font-mono text-[11px]">({subdomain}.adti.app.br)</span>
            </span>

            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-white/70 bg-white/10 px-2 py-0.5 rounded-md font-mono">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Banco Firestore: <strong>{projectId}</strong></span>
            </span>
          </div>
        </div>

        {/* Botões de Ação do Master */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => reloadTenant()}
            title="Recarregar banco deste cliente"
            className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={isExiting}
            onClick={handleReturnToMaster}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isExiting ? 'Voltando...' : 'Voltar ao Painel Master'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
