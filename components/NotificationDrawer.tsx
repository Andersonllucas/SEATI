'use client';

import React from 'react';
import { useToast } from '@/context/ToastContext';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  Trash2,
  CheckCheck,
  Clock
} from 'lucide-react';

export function NotificationDrawer() {
  const {
    isNotificationDrawerOpen,
    setIsNotificationDrawerOpen,
    notifications,
    unreadCount,
    markAllAsRead,
    clearNotifications
  } = useToast();

  if (!isNotificationDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-[99990] flex justify-end">
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 bg-primary/50 backdrop-blur-xs transition-opacity animate-fadeIn"
        onClick={() => setIsNotificationDrawerOpen(false)}
      />

      {/* Side drawer panel */}
      <div className="relative w-full max-w-md bg-surface-container-lowest h-full shadow-2xl border-l border-outline-variant/60 flex flex-col z-10 animate-slideLeft">
        {/* Header */}
        <div className="p-4 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
              <Bell className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-on-surface">Central de Alertas</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-error text-on-error px-1.5 py-0.2 rounded-full font-bold">
                    {unreadCount} novos
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Histórico de notificações e avisos da sessão
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsNotificationDrawerOpen(false)}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            title="Fechar painel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant font-medium text-[11px]">
              {notifications.length} registro(s)
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-secondary hover:underline font-semibold flex items-center gap-1 cursor-pointer text-[11px]"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar lidas
                </button>
              )}
              <button
                type="button"
                onClick={clearNotifications}
                className="text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
                title="Limpar todas as notificações"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar
              </button>
            </div>
          </div>
        )}

        {/* Notification list body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-on-surface-variant">
              <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 opacity-40" />
              </div>
              <p className="font-bold text-sm text-on-surface">Nenhuma notificação recente</p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
                Avisos de cadastros, validações de CPF/Título e erros de banco de dados aparecerão listados aqui.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isWarning = item.type === 'warn' || item.type === 'warning';
              const isError = item.type === 'error';
              const isSuccess = item.type === 'success';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                    isSuccess
                      ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                      : isWarning
                      ? 'bg-amber-50/60 border-amber-300 text-amber-950'
                      : isError
                      ? 'bg-rose-50/60 border-rose-300 text-rose-950'
                      : 'bg-surface border-outline-variant/60 text-on-surface'
                  } ${!item.read ? 'ring-1 ring-secondary/50' : 'opacity-85'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isWarning && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                      {isError && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                      {!isSuccess && !isWarning && !isError && (
                        <Info className="w-4 h-4 text-secondary shrink-0" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-on-surface-variant flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed font-normal text-on-surface-variant">
                    {item.message}
                  </p>

                  {item.details && (
                    <div className="mt-1 p-2 rounded bg-black/5 dark:bg-black/40 font-mono text-[10px] text-on-surface-variant break-words">
                      {item.details}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
          <span className="text-[11px] text-on-surface-variant">
            Notificações salvas durante a navegação ativa
          </span>
          <button
            type="button"
            onClick={() => setIsNotificationDrawerOpen(false)}
            className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
