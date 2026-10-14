'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Globe,
  CheckCircle2,
  X,
  Search,
  ArrowRight,
  Server,
  Building2,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { TenantClient } from '@/lib/tenantTypes';

interface TenantSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TenantSwitcherModal({ isOpen, onClose }: TenantSwitcherModalProps) {
  const { currentTenant, subdomain, switchToTenant } = useTenant();
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [customSubdomain, setCustomSubdomain] = useState<string>('');
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    fetch('/api/admin/clients', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.clients)) {
          setClients(data.clients);
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar lista de clientes:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (targetSubdomain: string) => {
    setSwitchingTo(targetSubdomain);
    switchToTenant(targetSubdomain);
    setTimeout(() => {
      onClose();
    }, 150);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customSubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean) {
      handleSelect(clean);
    }
  };

  const filteredClients = clients.filter((c) => {
    const term = searchTerm.toLowerCase();
    const nome = (c.nome || '').toLowerCase();
    const sub = (c.subdominio || '').toLowerCase();
    const proj = (c.firebaseConfig?.projectId || '').toLowerCase();
    return nome.includes(term) || sub.includes(term) || proj.includes(term);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Alternar Banco de Dados / Cliente
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Selecione qual base de campanha você deseja acessar em produção
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Database indicator */}
        <div className="px-5 py-3 bg-blue-950/40 border-b border-blue-900/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-300">Conectado agora:</span>
            <strong className="text-white font-bold">{currentTenant?.nome || `Campanha ${subdomain}`}</strong>
          </div>
          <span className="font-mono text-[11px] text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded border border-blue-700/50">
            {currentTenant?.firebaseConfig?.projectId || 'seati-d0096'}
          </span>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/80">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, subdomínio ou projeto Firebase..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">Carregando clientes cadastrados...</span>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Nenhum cliente cadastrado encontrado com esse termo.
            </div>
          ) : (
            filteredClients.map((c) => {
              const isCurrent = (c.subdominio || '').toLowerCase() === (subdomain || '').toLowerCase();
              const isSwitching = switchingTo === c.subdominio;
              const projectId = c.firebaseConfig?.projectId || 'seati-d0096';

              return (
                <button
                  key={c.id || c.subdominio}
                  type="button"
                  disabled={isCurrent || isSwitching}
                  onClick={() => handleSelect(c.subdominio)}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-blue-500/40 text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">
                        {c.nome || `Campanha ${c.subdominio}`}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Ativo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-300">
                        <Globe className="w-3 h-3 text-blue-400" />
                        {c.subdominio}
                      </span>
                      <span>&bull;</span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-300">
                        <Database className="w-3 h-3 text-emerald-400" />
                        banco: <strong className="font-semibold text-emerald-200">{projectId}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isSwitching ? (
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    ) : isCurrent ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <div className="p-2 rounded-lg bg-slate-700/50 group-hover:bg-blue-600 text-slate-300 group-hover:text-white transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Custom subdomain input form */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <form onSubmit={handleCustomSubmit} className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Ou digite o subdomínio direto do cliente:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSubdomain}
                onChange={(e) => setCustomSubdomain(e.target.value)}
                placeholder="ex: pd, marcelo, jpercy..."
                className="flex-1 h-9 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!customSubdomain.trim()}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Conectar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
