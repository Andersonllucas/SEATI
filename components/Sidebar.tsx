'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Zap,
  Award,
  MapPin,
  ShieldAlert,
  FileDown,
  Settings,
  HelpCircle,
  Vote,
  LogOut,
  Globe,
  Share2
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useCampaignUI } from '@/context/CampaignUIContext';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  alertCount?: number;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export const Sidebar = React.memo(function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalConflitosCount } = useCampaignUI();
  const { currentUser, logout, systemConfig, isAdmin } = useAuth();
  const { currentTenant, subdomain } = useTenant();

  const handleSuporteClick = () => {
    const contato = (systemConfig?.contatoSuporte || '').trim();
    if (!contato) {
      alert('Contato de suporte técnico não configurado.');
      return;
    }
    if (contato.startsWith('http://') || contato.startsWith('https://')) {
      window.open(contato, '_blank', 'noopener,noreferrer');
      return;
    }
    if (contato.includes('@')) {
      window.location.href = `mailto:${contato}?subject=Suporte%20Gestao%20Eleitoral`;
      return;
    }
    const digits = contato.replace(/\D/g, '');
    if (digits.length >= 10) {
      const ddiNumber = digits.length <= 11 ? `55${digits}` : digits;
      window.open(
        `https://wa.me/${ddiNumber}?text=Olá,%20preciso%20de%20suporte%20no%20sistema%20de%20Gestão%20Eleitoral.`,
        '_blank',
        'noopener,noreferrer'
      );
    } else if (digits.length > 0) {
      window.location.href = `tel:${digits}`;
    } else {
      alert(`Canal de suporte: ${contato}`);
    }
  };

  const handleLogout = async () => {
    if (onNavigate) onNavigate();
    await logout();
    try {
      router.replace('/login');
    } catch {
      // AppShell cuidará do fallback
    }
  };

  // Iniciais do usuário para o avatar
  const userInitials = React.useMemo(() => {
    if (!currentUser?.nome) return 'OP';
    const parts = currentUser.nome.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [currentUser?.nome]);

  // Seções organizadas e com nomenclaturas harmoniosas
  const navSections: NavSection[] = React.useMemo(() => {
    const sections: NavSection[] = [
      {
        id: 'operacao',
        title: 'Operação & Eleitorado',
        items: [
          { href: '/', icon: LayoutDashboard, label: 'Painel Geral' },
          { href: '/eleitores', icon: Users, label: 'Base de Eleitores' },
          { href: '/cadastro-em-massa', icon: Zap, label: 'Cadastro em Lote', badge: 'Rápido' },
          { href: '/cadastro-externo', icon: Share2, label: 'Link de Campo (Externo)', badge: 'Público' },
        ],
      },
      {
        id: 'articulacao',
        title: 'Território & Equipe',
        items: [
          { href: '/liderancas', icon: Award, label: 'Lideranças e Apoios' },
          { href: '/locais', icon: MapPin, label: 'Locais de Votação' },
          {
            href: '/validacoes',
            icon: ShieldAlert,
            label: 'Auditoria de Conflitos',
            alertCount: totalConflitosCount > 0 ? totalConflitosCount : undefined,
          },
        ],
      },
      {
        id: 'gestao',
        title: 'Inteligência & Gestão',
        items: [
          { href: '/importacao', icon: FileDown, label: 'Importação e Relatórios' },
          { href: '/configuracoes', icon: Settings, label: 'Configurações Gerais' },
        ],
      },
    ];

    if (isAdmin) {
      sections.push({
        id: 'administracao',
        title: 'Administração',
        items: [
          {
            href: '/admin-master',
            icon: Globe,
            label: 'Painel Master Multi-Tenant',
            badge: 'Master',
          },
        ],
      });
    }

    return sections;
  }, [isAdmin, totalConflitosCount]);

  const activeCampaignName = currentTenant?.nome || (subdomain && subdomain !== 'demo' ? `Campanha ${subdomain}` : 'Campanha Teresina 2026');
  const activeSubdomain = currentTenant?.subdominio || subdomain || 'demo';

  return (
    <aside className="w-68 h-full flex flex-col bg-primary border-r border-white/10 select-none shadow-2xl md:shadow-none text-slate-100 shrink-0">
      {/* 1. TOPO: Identidade Visual Institucional */}
      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary/80 to-primary-container border border-white/15 flex items-center justify-center text-white shadow-md shadow-black/20 shrink-0">
            <Vote className="w-5 h-5 text-secondary-container" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold text-white tracking-tight font-display leading-none">
                SEATI
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-secondary-container tracking-wider uppercase leading-none">
                Eleitoral
              </span>
            </div>
            <span className="text-[11px] text-slate-400 truncate mt-0.5">
              Gestão Política & Dados
            </span>
          </div>
        </div>
      </div>

      {/* 2. CARD DE CONTEXTO DA CAMPANHA ATIVA */}
      <div className="px-3 pt-3 pb-1">
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Campanha Conectada
            </span>
          </div>
          <p className="text-xs font-bold text-white truncate" title={activeCampaignName}>
            {activeCampaignName}
          </p>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono truncate mt-0.5">
            <Globe className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">{activeSubdomain}.adti.app.br</span>
          </div>
        </div>
      </div>

      {/* 3. NAVEGAÇÃO ORGANIZADA POR SEÇÕES */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-4">
        {navSections.map((section) => (
          <div key={section.id} className="space-y-1">
            <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400/70">
              {section.title}
            </div>

            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={onNavigate}
                    className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-white/[0.12] text-white font-semibold shadow-xs border border-white/10'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-secondary-container rounded-r-full" />
                    )}

                    <item.icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive
                          ? 'text-secondary-container'
                          : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />

                    <span className="truncate flex-1">{item.label}</span>

                    {item.badge && (
                      <span className="text-[10px] font-bold text-sky-200 bg-sky-500/20 border border-sky-400/30 px-1.5 py-0.5 rounded-md shrink-0">
                        {item.badge}
                      </span>
                    )}

                    {item.alertCount !== undefined && item.alertCount > 0 && (
                      <span
                        title={`${item.alertCount} duplicidade(s) ou conflito(s) aguardando resolução`}
                        className="text-[10px] font-bold text-rose-200 bg-rose-500/25 border border-rose-500/40 px-1.5 py-0.5 rounded-full shrink-0 animate-pulse"
                      >
                        {item.alertCount > 99 ? '99+' : item.alertCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* 4. RODAPÉ: CARD DO OPERADOR & UTILITÁRIOS */}
      <div className="p-3 border-t border-white/[0.08] bg-black/20 flex flex-col gap-2.5">
        {/* Card do Usuário Logado */}
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ${
              isAdmin
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {userInitials}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span
              className="text-xs font-semibold text-white truncate leading-tight"
              title={currentUser?.nome || 'Operador'}
            >
              {currentUser?.nome || 'Operador'}
            </span>
            <span className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
              {currentUser?.perfil || 'Operador'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Encerrar Sessão no Sistema"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Botão PWA e Link de Suporte */}
        <div className="space-y-1.5">
          <PWAInstallButton />

          <div className="flex items-center justify-between px-1 text-xs">
            <button
              type="button"
              onClick={handleSuporteClick}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-[11px] py-1 cursor-pointer font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>Suporte Técnico</span>
            </button>

            <span className="text-[10px] text-slate-500 font-mono">SEATI v2.4</span>
          </div>
        </div>
      </div>
    </aside>
  );
});
