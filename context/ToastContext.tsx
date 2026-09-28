'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

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
  clearNotifications: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      type,
      title,
      message,
      details,
      duration = 10000,
      id: customId
    }: {
      type: ToastType;
      title: string;
      message: string;
      details?: string;
      duration?: number;
      id?: string;
    }) => {
      const id = customId || `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newToast: ToastItem = {
        id,
        type,
        title,
        message,
        details,
        duration,
        timestamp: new Date()
      };

      // Adiciona o toast à lista ativa
      setToasts((prev) => [newToast, ...prev.slice(0, 3)]); // Máximo de 4 toasts simultâneos

      // Registra no histórico da Central de Notificações
      const newNotification: NotificationItem = {
        id: `notif-${id}`,
        type,
        title,
        message,
        details,
        timestamp: new Date(),
        read: false
      };
      setNotifications((prev) => [newNotification, ...prev.slice(0, 49)]); // Até 50 itens
    },
    []
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

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
        clearNotifications
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
