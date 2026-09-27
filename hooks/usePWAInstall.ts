import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Capture beforeinstallprompt globally as early as possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__deferredPWAInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
  });

  window.addEventListener('appinstalled', () => {
    window.__deferredPWAInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

function subscribeInstalled(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(display-mode: standalone)');
  mql.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  window.addEventListener('pwa-installed', callback);
  return () => {
    mql.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
    window.removeEventListener('pwa-installed', callback);
  };
}

function getInstalledSnapshot() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function getServerSnapshot() {
  return false;
}

function subscribeNoop() {
  return () => {};
}

function getIOSSnapshot() {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function subscribePrompt(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('beforeinstallprompt', callback);
  window.addEventListener('pwa-prompt-available', callback);
  window.addEventListener('appinstalled', callback);
  window.addEventListener('pwa-installed', callback);
  return () => {
    window.removeEventListener('beforeinstallprompt', callback);
    window.removeEventListener('pwa-prompt-available', callback);
    window.removeEventListener('appinstalled', callback);
    window.removeEventListener('pwa-installed', callback);
  };
}

function getPromptSnapshot(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__deferredPWAInstallPrompt || null;
}

function getPromptServerSnapshot(): null {
  return null;
}

export function usePWAInstall() {
  const deferredPrompt = useSyncExternalStore(subscribePrompt, getPromptSnapshot, getPromptServerSnapshot);
  const isStandalone = useSyncExternalStore(subscribeInstalled, getInstalledSnapshot, getServerSnapshot);
  const isIOS = useSyncExternalStore(subscribeNoop, getIOSSnapshot, getServerSnapshot);
  const isInstalled = isStandalone;

  const install = async () => {
    const activePrompt = deferredPrompt || (typeof window !== 'undefined' ? window.__deferredPWAInstallPrompt : null);
    if (!activePrompt) return false;

    try {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        window.__deferredPWAInstallPrompt = null;
        window.dispatchEvent(new CustomEvent('pwa-installed'));
        return true;
      }
    } catch (err) {
      console.warn('[PWA] Error triggering install prompt:', err);
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt && !isInstalled,
    hasNativePrompt: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
