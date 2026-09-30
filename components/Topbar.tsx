'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Menu,
  ShieldCheck,
  User as UserIcon,
  ChevronDown,
  Users,
  History,
  LogOut,
  Globe,
  Bell,
  Sliders
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';
import { ConfigurableHeaderButtons } from '@/components/ConfigurableHeaderButtons';

export const Topbar = React.memo(function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { currentUser, isAdmin, logout } = useAuth();
  const { unreadCount, setIsNotificationDrawerOpen } = useToast();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 w-full bg-surface-container-lowest border-b border-outline-variant/40 sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 shadow-sm shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="md:hidden text-on-surface-variant p-2 hover:bg-surface-container rounded-lg cursor-pointer"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="relative w-64 md:w-96 hidden sm:block">
          <Search className="w-5 h-5 absolute left-3 top-2 text-outline" />
          <input
            type="text"
            placeholder="Buscar eleitor, liderança ou seção..."
            className="w-full h-9 pl-10 pr-4 bg-surface border border-outline-variant rounded-md focus:border-secondary focus:ring-1 focus:ring-secondary text-sm text-on-surface outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Botões Rápidos Configuráveis */}
        <ConfigurableHeaderButtons />

        {/* Botão Central de Notificações & Alertas */}
        <button
          type="button"
          onClick={() => setIsNotificationDrawerOpen(true)}
          className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
            unreadCount > 0
              ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 shadow-sm ring-1 ring-primary/20'
              : 'border-outline-variant/50 hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
          }`}
          title={
            unreadCount > 0
              ? `${unreadCount} notificação(ões) pendente(s) - Clique para abrir`
              : 'Central de Alertas e Notificações'
          }
          aria-label="Abrir central de alertas e notificações"
        >
          <Bell className={`w-5 h-5 transition-transform ${unreadCount > 0 ? 'text-primary scale-105' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-lg ring-2 ring-surface animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-xl hover:bg-surface-container border border-outline-variant/50 transition-all cursor-pointer select-none"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm ${
              isAdmin 
                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}>
              {isAdmin ? <ShieldCheck className="w-5 h-5 text-amber-700" /> : <UserIcon className="w-4 h-4 text-blue-700" />}
            </div>

            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-bold text-on-surface leading-tight max-w-[130px] truncate">
                {currentUser ? currentUser.nome : 'Carregando...'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                  isAdmin 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {currentUser?.perfil || 'Operador'}
                </span>
              </div>
            </div>

            <ChevronDown className="w-4 h-4 text-on-surface-variant ml-0.5" />
          </button>

          {/* Menu Dropdown - Seguro, sem troca arbitrária de usuário */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Informações do usuário autenticado */}
              <div className="p-3.5 bg-surface-container-low border-b border-outline-variant/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    Sessão Ativa
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {currentUser?.perfil}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-on-surface truncate">
                  {currentUser?.nome}
                </h4>
                <p className="text-xs text-on-surface-variant truncate">
                  {currentUser?.email}
                </p>
                {currentUser?.telefone && (
                  <p className="text-[11px] text-on-surface-variant/80 truncate mt-0.5">
                    {currentUser?.telefone}
                  </p>
                )}
              </div>

              {/* Ações de navegação do usuário */}
              <div className="p-2 space-y-0.5">
                <Link
                  href="/configuracoes?tab=parametros"
                  prefetch={true}
                  onClick={() => setIsDropdownOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                >
                  <Sliders className="w-4 h-4 text-primary" />
                  <span>Configurações da Campanha</span>
                </Link>

                {isAdmin && (
                  <>
                    <Link
                      href="/configuracoes?tab=usuarios"
                      prefetch={true}
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <Users className="w-4 h-4 text-secondary" />
                      <span>Gerenciar Operadores e Usuários</span>
                    </Link>
                    <Link
                      href="/configuracoes?tab=auditoria"
                      prefetch={true}
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <History className="w-4 h-4 text-outline" />
                      <span>Trilha de Auditoria</span>
                    </Link>
                    <Link
                      href="/admin-master"
                      prefetch={true}
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Globe className="w-4 h-4 text-primary" />
                      <span>Painel Master (Clientes & Bancos)</span>
                    </Link>
                  </>
                )}
              </div>

              {/* Botão de Encerramento Seguro de Sessão */}
              <div className="p-2 border-t border-outline-variant/40 bg-surface-container-lowest">
                <button
                  type="button"
                  onClick={async () => {
                    setIsDropdownOpen(false);
                    await logout();
                    try {
                      router.replace('/login');
                    } catch {
                      // fallback
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-red-600 shrink-0" />
                  <div className="text-left leading-tight">
                    <p>Sair da Conta (Logout)</p>
                    <p className="text-[10px] text-red-500/80 font-normal">Exige nova autenticação com senha</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
});
