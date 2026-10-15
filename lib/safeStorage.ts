/**
 * Utilitário seguro para armazenamento em navegador (sessionStorage)
 * Garante que a sessão do usuário seja volátil e expire automaticamente
 * no fechamento da janela ou navegador, conforme a política de segurança da aplicação.
 */

const memoryStore = new Map<string, string>();

// Limpeza preventiva de dados de sessão legados do localStorage
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('gestao_eleitoral_cached_user');
    window.localStorage.removeItem('gestao_eleitoral_user_id');
  } catch {}
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch {
      // Fallback para memória em iframes restritos
    }
    return memoryStore.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback para memória
    }
    memoryStore.set(key, String(value));
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Fallback
    }
    memoryStore.delete(key);
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch {
      // Fallback
    }
    memoryStore.clear();
  }
};
