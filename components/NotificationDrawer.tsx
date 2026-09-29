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
  Clock,
  Check
} from 'lucide-react';

export function NotificationDrawer() {
  const {
    isNotificationDrawerOpen,
    setIsNotificationDrawerOpen,
    notifications,
    unreadCount,
    markAllAsRead,
    markAsRead,
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
            <div className="w-9 h-9 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-xs">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-on-surface">Central de Alertas</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-extrabold shadow-xs animate-pulse">
                    {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Alertas de alterações, exclusões e monitoramento
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsNotificationDrawerOpen(false)}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant font-medium text-[11px]">
              {notifications.length} registro(s) {unreadCount > 0 && `• ${unreadCount} não lida(s)`}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer text-[11px]"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar todas como lidas
                </button>
              )}
              <button
                type="button"
                onClick={clearNotifications}
                className="text-on-surface-variant hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
                title="Limpar histórico"
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
              <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-3">
                <Bell className="w-7 h-7 opacity-40 text-on-surface-variant" />
              </div>
              <p className="font-bold text-sm text-on-surface">Nenhuma notificação no histórico</p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-xs leading-relaxed">
                Avisos de alterações e exclusões do sistema aparecem listados aqui em tempo real.
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
                  onClick={() => {
                    if (!item.read) markAsRead(item.id);
                  }}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all cursor-pointer relative ${
                    isSuccess
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                      : isWarning
                      ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                      : isError
                      ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                      : 'bg-surface border-outline-variant/60 text-on-surface'
                  } ${
                    !item.read
                      ? 'shadow-xs ring-1 ring-primary/40'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isWarning && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                      {isError && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                      {!isSuccess && !isWarning && !isError && (
                        <Info className="w-4 h-4 text-primary shrink-0" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!item.read && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(item.id);
                          }}
                          className="text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                          title="Marcar como lida"
                        >
                          <Check className="w-3 h-3" />
                          <span>Lida</span>
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-on-surface-variant flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed font-normal text-on-surface-variant">
                    {item.message}
                  </p>

                  {item.details && (
                    <div className="mt-1 p-2 rounded bg-black/5 dark:bg-black/30 font-mono text-[10px] text-on-surface-variant break-words">
                      {item.details}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
          <span className="text-[11px] text-on-surface-variant">
            {unreadCount > 0 ? `${unreadCount} alerta(s) pendente(s)` : 'Nenhum alerta pendente'}
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
