'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'warn' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  details?: string;
  duration?: number;
  timestamp: Date;
}

export interface NotificationItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  details?: string;
  timestamp: Date;
  read: boolean;
}

export interface ToastContextType {
  toasts: ToastItem[];
  notifications: NotificationItem[];
  unreadCount: number;
  isNotificationDrawerOpen: boolean;
  setIsNotificationDrawerOpen: (open: boolean) => void;
  showToast: (toast: {
    type: ToastType;
    title: string;
    message: string;
    details?: string;
    duration?: number;
    id?: string;
  }) => void;
  dismissToast: (id: string) => void;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  triggerTestNotification: () => void;
}

const STORAGE_KEY = 'adti_notifications_v3';

export function dispatchAppNotification(detail: {
  type: ToastType;
  title: string;
  message: string;
  details?: string;
  duration?: number;
  id?: string;
  tipo?: string;
}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app:notification', { detail }));
  }
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);

  // Inicializa carregando notificações com apenas a de boas-vindas no badge ativo imediato
  useEffect(() => {
    const now = new Date();
    const welcomeItem: NotificationItem = {
      id: 'notif-welcome',
      type: 'info',
      title: 'Boas-vindas ao Sistema',
      message: 'Você está conectado à Central de Operações da Campanha.',
      details: 'Notificações de alterações e exclusões aparecerão aqui.',
      timestamp: now,
      read: false
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filtra cadastros e eventos de firestore de históricos antigos
          const filtered = parsed
            .filter((item: any) => {
              const t = (item.title || '').toLowerCase();
              const m = (item.message || '').toLowerCase();
              return (
                !t.includes('firestore') &&
                !m.includes('firestore') &&
                !t.includes('cota') &&
                !t.includes('cadastro') &&
                !t.includes('cadastrado') &&
                !t.includes('novo eleitor') &&
                item.id !== 'notif-init-1' &&
                item.id !== 'notif-init-2'
              );
            })
            .map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            }));

          if (filtered.length > 0) {
            setNotifications(filtered);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar notificações do armazenamento local:', err);
    }

    // Inicializa somente com a notificação de boas-vindas no badge ativo imediato
    setNotifications([welcomeItem]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([welcomeItem]));
    } catch {}
  }, []);

  // Persiste alterações nas notificações no localStorage
  const saveNotificationsToStorage = useCallback((items: NotificationItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      type,
      title,
      message,
      details,
      duration = 8000,
      id: customId
    }: {
      type: ToastType;
      title: string;
      message: string;
      details?: string;
      duration?: number;
      id?: string;
    }) => {
      const id = customId || `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();

      const newToast: ToastItem = {
        id,
        type,
        title,
        message,
        details,
        duration,
        timestamp: now
      };

      // Adiciona toast flutuante (máximo 4 simultâneos)
      setToasts((prev) => [newToast, ...prev.slice(0, 3)]);

      // Registra na Central de Alertas (gaveta de notificações)
      // REGRA: Sem notificações de firestore e sem cadastros, somente alteração ou exclusão
      const titleLower = title.toLowerCase();
      const msgLower = message.toLowerCase();
      const isFirestore =
        titleLower.includes('firestore') ||
        msgLower.includes('firestore') ||
        titleLower.includes('banco de dados');
      const isCadastro =
        titleLower.includes('cadastr') ||
        msgLower.includes('cadastr') ||
        titleLower.includes('novo eleitor') ||
        titleLower.includes('novo usuário') ||
        titleLower.includes('novo local');

      if (!isFirestore && !isCadastro) {
        const newNotification: NotificationItem = {
          id: `notif-${id}`,
          type,
          title,
          message,
          details,
          timestamp: now,
          read: false
        };

        setNotifications((prev) => {
          const updated = [newNotification, ...prev.slice(0, 49)];
          saveNotificationsToStorage(updated);
          return updated;
        });
      }
    },
    [saveNotificationsToStorage]
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotificationsToStorage(updated);
      return updated;
    });
  }, [saveNotificationsToStorage]);

  const markAsRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        saveNotificationsToStorage(updated);
        return updated;
      });
    },
    [saveNotificationsToStorage]
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const triggerTestNotification = useCallback(() => {
    const tipos: ToastType[] = ['info', 'success', 'warn'];
    const tipo = tipos[Math.floor(Math.random() * tipos.length)];
    const titles = {
      info: 'Notificação de Teste',
      success: 'Operação Registrada',
      warn: 'Alerta de Monitoramento'
    };
    const messages = {
      info: 'O sino de notificações e a central de alertas estão funcionando 100%!',
      success: 'Novo evento registrado com sucesso na central de alertas.',
      warn: 'Monitoramento de rotina ativo sem pendências operacionais.'
    };

    showToast({
      type: tipo,
      title: titles[tipo as keyof typeof titles] || 'Notificação de Teste',
      message: messages[tipo as keyof typeof messages] || 'Alerta emitido pelo sistema.',
      details: `Horário de verificação: ${new Date().toLocaleTimeString()}`
    });
  }, [showToast]);

  // Ouvinte de notificações da aplicação (apenas alterações e exclusões)
  useEffect(() => {
    const handleAppNotification = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        const d = customEvent.detail;
        // Rejeita notificações de cadastro e de firestore
        if (d.tipo && d.tipo !== 'ALTERACAO' && d.tipo !== 'EXCLUSAO') {
          return;
        }

        const t = (d.title || '').toLowerCase();
        const m = (d.message || '').toLowerCase();
        if (
          t.includes('firestore') ||
          m.includes('firestore') ||
          t.includes('cota') ||
          t.includes('cadastr') ||
          m.includes('cadastr') ||
          t.includes('novo eleitor') ||
          t.includes('novo usuário')
        ) {
          return;
        }

        showToast(customEvent.detail);
      }
    };

    window.addEventListener('app:notification', handleAppNotification);
    return () => {
      window.removeEventListener('app:notification', handleAppNotification);
    };
  }, [showToast]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <ToastContext.Provider
      value={{
        toasts,
        notifications,
        unreadCount,
        isNotificationDrawerOpen,
        setIsNotificationDrawerOpen,
        showToast,
        dismissToast,
        markAllAsRead,
        markAsRead,
        clearNotifications,
        triggerTestNotification
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
}
