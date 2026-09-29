'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  signInWithCustomToken,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { getActiveDb, getActiveAuth, getCentralDb } from '@/lib/firebase';
import { useTenant } from '@/context/TenantContext';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { handleFirestoreError, OperationType, isCircuitBroken } from '@/lib/firestoreErrors';
import { getCachedCollection, setCachedCollection } from '@/lib/firestoreCache';

export type UserRole = 'Administrador' | 'Operador';
export type UserStatus = 'Ativo' | 'Inativo';
export type LogTipo = 'ACESSO' | 'EXCLUSAO' | 'ALTERACAO';

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  senha?: string;
  perfil: UserRole;
  telefone?: string;
  status: UserStatus;
  dataCadastro?: any;
  ultimoAcesso?: any;
  cargo?: string;
  senhaProvisoria?: boolean;
}

export interface LogAuditoria {
  id: string;
  data: any;
  tipo: LogTipo;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioPerfil: UserRole;
  acao: string;
  detalhes?: string;
  entidade?: string;
  entidadeId?: string;
}

export interface CustomHeaderButton {
  id: string;
  label: string;
  url: string;
  targetBlank?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'surface';
  icon?: 'link' | 'user' | 'chat' | 'file' | 'globe' | 'star' | 'external';
}

export interface SystemConfig {
  nomeCampanha: string;
  candidatoNome: string;
  cargoDisputado: string;
  partidoNumero: string;
  senhaMestre: string;
  metaTotalVotos?: number;
  metaVotos?: number;
  validacaoCpfObrigatoria?: boolean;
  bloqueioTituloDuplicado?: boolean;
  municipioPadrao: string;
  ufPadrao: string;
  contatoSuporte: string;
  botoesCabecalho?: CustomHeaderButton[];
  atualizadoPor?: string;
  dataAtualizacao?: any;
}

export interface MasterPasswordPromptOptions {
  title: string;
  description: string;
  actionType?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  onConfirm?: () => Promise<void> | void;
  onSuccess?: () => Promise<void> | void;
}

interface AuthContextType {
  currentUser: AppUser | null;
  usuarios: AppUser[];
  logs: LogAuditoria[];
  systemConfig: SystemConfig;
  isLoading: boolean;
  isAuthReady: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  login: (email: string, senha: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchUser: (targetUser: AppUser) => Promise<void>;
  cadastrarUsuario: (data: Omit<AppUser, 'id' | 'dataCadastro'>) => Promise<string>;
  atualizarUsuario: (id: string, data: Partial<AppUser>) => Promise<void>;
  excluirUsuario: (id: string, senhaMestre?: string) => Promise<void>;
  atualizarSenhaMestre: (novaSenha: string) => Promise<void>;
  atualizarConfiguracoes: (dados: Partial<SystemConfig>) => Promise<void>;
  validarSenhaMestre: (senha: string) => Promise<boolean>;
  registrarLog: (params: {
    tipo: LogTipo;
    acao: string;
    detalhes?: string;
    entidade?: string;
    entidadeId?: string;
  }) => Promise<void>;
  solicitarSenhaMestre: (options: MasterPasswordPromptOptions) => void;
  fecharSolicitacaoSenhaMestre: () => void;
  activePrompt: MasterPasswordPromptOptions | null;
}

const DEFAULT_CONFIG: SystemConfig = {
  nomeCampanha: 'Campanha Teresina 2026',
  candidatoNome: 'Candidato Oficial',
  cargoDisputado: 'Deputado Estadual',
  partidoNumero: '10',
  senhaMestre: 'pbkdf2:sha256:100000:a889a86dcccee4d538690d763b019837:2b7d5802a847b78290c5cebed20ac10e31f56c63f378152ad1429cbecdb61b36',
  metaTotalVotos: 50000,
  metaVotos: 50000,
  validacaoCpfObrigatoria: true,
  bloqueioTituloDuplicado: true,
  municipioPadrao: 'Teresina',
  ufPadrao: 'PI',
  contatoSuporte: '(86) 99999-0000',
  botoesCabecalho: []
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { currentTenant, subdomain, isLoadingTenant, activeDb, activeAuth, tenantVersion, suspendTenant } = useTenant();
  const tenantKey = subdomain || currentTenant?.subdominio || 'central';

  // Inicialização estável e consistente entre SSR e o primeiro ciclo de hidratação no cliente
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [usuarios, setUsuarios] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activePrompt, setActivePrompt] = useState<MasterPasswordPromptOptions | null>(null);

  const currentUserRef = useRef<AppUser | null>(null);
  currentUserRef.current = currentUser;

  // Restaura estado inicial de cache local após montagem no cliente para evitar hydration mismatch
  useEffect(() => {
    try {
      // 1. Verifica se há uma sessão de suporte master ativa para o tenant atual
      const impSub = typeof window !== 'undefined' ? localStorage.getItem('adti_impersonating_tenant') : null;
      const masterUserStr = typeof window !== 'undefined' ? (sessionStorage.getItem('adti_admin_master_user') || localStorage.getItem('adti_admin_master_user')) : null;

      if (impSub && (impSub === tenantKey || impSub === subdomain) && masterUserStr) {
        try {
          const masterParsed = JSON.parse(masterUserStr);
          const masterSupportUser: AppUser = {
            id: `master_support_${impSub}`,
            nome: `${masterParsed.nome || 'Administrador Master'} (Suporte)`,
            email: masterParsed.email || 'master@adti.app.br',
            perfil: 'Administrador' as UserRole,
            status: 'Ativo' as UserStatus,
            dataCadastro: new Date().toISOString()
          };
          setCurrentUser(masterSupportUser);
          setIsAuthReady(true);
          localStorage.removeItem('gestao_eleitoral_logged_out');
        } catch {}
      } else {
        const isLoggedOut = localStorage.getItem('gestao_eleitoral_logged_out') === 'true';
        if (!isLoggedOut) {
          const cached = localStorage.getItem('gestao_eleitoral_cached_user');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed) {
              setCurrentUser(parsed);
              setIsAuthReady(true);
            }
          }
        }
      }
      const cachedUsers = getCachedCollection<AppUser>('usuarios', undefined, tenantKey);
      setUsuarios(cachedUsers?.data || []);

      const cachedConfig = localStorage.getItem(`adti_cache_${tenantKey}_configuracoes`);
      if (cachedConfig) {
        setSystemConfig({ ...DEFAULT_CONFIG, nomeCampanha: currentTenant?.nome || DEFAULT_CONFIG.nomeCampanha, ...JSON.parse(cachedConfig) });
      } else if (currentTenant?.nome) {
        setSystemConfig((prev) => ({ ...prev, nomeCampanha: currentTenant.nome }));
      }
    } catch (e) {
      console.warn('Erro ao restaurar cache local inicial:', e);
    }

    // Timeout de salvaguarda para assegurar transição mesmo sem resposta imediata do Firebase
    const safetyTimer = setTimeout(() => {
      setIsAuthReady(true);
    }, 1200);

    return () => clearTimeout(safetyTimer);
  }, [tenantKey, tenantVersion, subdomain, currentTenant?.nome]);

  // 0. Sincroniza sessão do Firebase Auth com os usuários da coleção `usuarios`
  useEffect(() => {
    try {
      const targetAuth = activeAuth || getActiveAuth();
      const targetDb = activeDb || getActiveDb();
      const unsubAuth = onAuthStateChanged(targetAuth, async (fbUser) => {
        try {
          if (fbUser) {
            let userResolved = false;

            // Se já temos o usuário em cache com o mesmo id/email, preserva sem queimar leituras
            const existing = currentUserRef.current;
            if (existing && (existing.id === fbUser.uid || existing.email === fbUser.email)) {
              userResolved = true;
            }

            // 1. Tenta buscar dados do documento do usuário no Firestore apenas se não resolvido
            if (!userResolved && !isCircuitBroken('usuarios')) {
              try {
                const userSnap = await getDoc(doc(targetDb, 'usuarios', fbUser.uid));
                if (userSnap.exists()) {
                  const uData = { id: userSnap.id, ...userSnap.data() } as AppUser;
                  if (uData.status === 'Ativo') {
                    setCurrentUser(uData);
                    userResolved = true;
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('gestao_eleitoral_cached_user', JSON.stringify(uData));
                    }
                  }
                }
              } catch (firestoreErr) {
                console.warn('Aviso de conexão ao ler usuário:', firestoreErr);
              }
            }

            // 2. Fallback de cache local: preserva a sessão mesmo se o Firestore estiver com cota excedida
            if (!userResolved && typeof window !== 'undefined') {
              const cachedStr = localStorage.getItem('gestao_eleitoral_cached_user');
              if (cachedStr) {
                try {
                  const cachedUser = JSON.parse(cachedStr);
                  if (cachedUser && (cachedUser.id === fbUser.uid || cachedUser.email === fbUser.email)) {
                    setCurrentUser(cachedUser);
                    userResolved = true;
                  }
                } catch {}
              }
            }

            // 3. Resolução baseada no usuário autenticado no Firebase Auth
            if (!userResolved && fbUser.email) {
              const emailLower = fbUser.email.toLowerCase();
              const isAdmin = emailLower.includes('admin');
              const fallbackUser: AppUser = {
                id: fbUser.uid,
                nome: fbUser.displayName || emailLower.split('@')[0],
                email: emailLower,
                perfil: isAdmin ? 'Administrador' : 'Operador',
                status: 'Ativo'
              };
              setCurrentUser(fallbackUser);
              if (typeof window !== 'undefined') {
                localStorage.setItem('gestao_eleitoral_cached_user', JSON.stringify(fallbackUser));
              }
            }
          } else {
            // Firebase Auth sem sessão: verifica se há sessão de suporte master ativa para este cliente
            if (typeof window !== 'undefined') {
              const impSub = localStorage.getItem('adti_impersonating_tenant');
              const masterUserStr = sessionStorage.getItem('adti_admin_master_user') || localStorage.getItem('adti_admin_master_user');

              if (impSub && (impSub === tenantKey || impSub === subdomain) && masterUserStr) {
                try {
                  const masterParsed = JSON.parse(masterUserStr);
                  const masterSupportUser: AppUser = {
                    id: `master_support_${impSub}`,
                    nome: `${masterParsed.nome || 'Administrador Master'} (Suporte)`,
                    email: masterParsed.email || 'master@adti.app.br',
                    perfil: 'Administrador' as UserRole,
                    status: 'Ativo' as UserStatus,
                    dataCadastro: new Date().toISOString()
                  };
                  setCurrentUser(masterSupportUser);
                } catch {}
              } else {
                const isLoggedOut = localStorage.getItem('gestao_eleitoral_logged_out') === 'true';
                if (isLoggedOut) {
                  setCurrentUser(null);
                  localStorage.removeItem('gestao_eleitoral_user_id');
                  localStorage.removeItem('gestao_eleitoral_cached_user');
                  sessionStorage.removeItem('gestao_eleitoral_user_id');
                }
              }
            }
          }
        } catch (e) {
          console.warn('Monitor Firebase Auth aviso:', e);
        } finally {
          setIsAuthReady(true);
          setIsLoading(false);
        }
      });
      return () => unsubAuth();
    } catch (e) {
      console.warn('Monitor Firebase Auth aviso:', e);
      setIsAuthReady(true);
      setIsLoading(false);
    }
  }, [tenantKey, tenantVersion, activeDb, activeAuth]);

  // PARTE 5: Monitoramento em tempo real do status do cliente em clientes_registry (banco central)
  // Enquanto uma sessão estiver ativa em um subdomínio de cliente, observa o campo status.
  // Se mudar para inativo, força logout imediato e redireciona para a tela de acesso suspenso.
  useEffect(() => {
    if (!currentUser || !subdomain || subdomain === 'admin' || subdomain === 'demo') {
      return;
    }

    const docId = currentTenant?.id || subdomain;
    if (!docId) return;

    let isListenerActive = true;
    const centralDb = getCentralDb();
    const clientDocRef = doc(centralDb, 'clientes_registry', docId);

    const handleTenantSuspension = async () => {
      console.warn(`[Segurança Multi-Tenant] Cliente "${subdomain}" desativado. Forçando desconexão imediata.`);

      try {
        const targetAuth = activeAuth || getActiveAuth();
        await signOut(targetAuth);
      } catch (err) {
        console.warn('Erro ao deslogar do Firebase Auth durante suspensão:', err);
      }

      setCurrentUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gestao_eleitoral_user_id');
        localStorage.removeItem('gestao_eleitoral_cached_user');
        localStorage.removeItem('adti_admin_master_user');
        sessionStorage.removeItem('adti_admin_master_user');
        sessionStorage.removeItem('gestao_eleitoral_user_id');
        localStorage.setItem('gestao_eleitoral_logged_out', 'true');
      }

      suspendTenant(subdomain);

      if (typeof window !== 'undefined' && window.location.pathname !== '/tenant-error') {
        window.location.href = `/tenant-error?reason=inactive&subdomain=${encodeURIComponent(subdomain)}`;
      }
    };

    const unsubscribe = onSnapshot(
      clientDocRef,
      async (snapshot) => {
        if (!isListenerActive) return;

        if (!snapshot.exists()) {
          await handleTenantSuspension();
          return;
        }

        const data = snapshot.data();
        if (data && data.status === 'inativo') {
          await handleTenantSuspension();
        }
      },
      (error) => {
        console.warn('[Segurança Multi-Tenant] Erro no listener do cliente:', error);
      }
    );

    return () => {
      isListenerActive = false;
      unsubscribe();
    };
  }, [currentUser?.id, subdomain, currentTenant?.id, activeAuth, suspendTenant]);

  const currentUserId = currentUser?.id;
  const currentUserPerfil = currentUser?.perfil;

  // 1. Listen for system configurations (com circuit breaker e cache local)
  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('configuracoes/geral', tenantKey)) {
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const targetAuth = activeAuth || getActiveAuth();
    const configDocRef = doc(targetDb, 'configuracoes', 'geral');
    let isSubscribed = true;

    const tenantBaseConfig: SystemConfig = {
      ...DEFAULT_CONFIG,
      nomeCampanha: currentTenant?.nome || (tenantKey !== 'demo' && tenantKey !== 'central' ? tenantKey : DEFAULT_CONFIG.nomeCampanha)
    };

    const unsubConfig = onSnapshot(
      configDocRef,
      (snap) => {
        if (!isSubscribed) return;
        if (snap.exists()) {
          const data = snap.data() as SystemConfig;
          const merged = {
            ...tenantBaseConfig,
            ...data,
            senhaMestre: data.senhaMestre || DEFAULT_CONFIG.senhaMestre
          };
          setSystemConfig(merged);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`adti_cache_${tenantKey}_configuracoes`, JSON.stringify(merged));
            } catch {}
          }
        } else if (currentUserPerfil === 'Administrador' && targetAuth.currentUser) {
          setDoc(configDocRef, {
            ...tenantBaseConfig,
            atualizadoPor: 'Sistema Inicial',
            dataAtualizacao: serverTimestamp()
          }).catch((err) => console.warn('Aviso ao inicializar configuracoes:', err?.message));
        }
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.GET, 'configuracoes/geral', tenantKey);
      }
    );

    return () => {
      isSubscribed = false;
      unsubConfig();
    };
  }, [currentUserId, currentUserPerfil, isAuthReady, tenantKey, tenantVersion, currentTenant, activeDb, activeAuth, isLoadingTenant]);

  // 2. Listen for users in Firestore (com limite de segurança e circuit breaker)
  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('usuarios', tenantKey)) {
      const cached = getCachedCollection<AppUser>('usuarios', undefined, tenantKey);
      if (cached?.data && cached.data.length > 0) {
        setUsuarios(cached.data);
      }
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const qUsers = query(collection(targetDb, 'usuarios'), orderBy('dataCadastro', 'desc'), limit(100));
    let isSubscribed = true;

    const unsubUsers = onSnapshot(
      qUsers,
      (snapshot) => {
        if (!isSubscribed) return;
        const userList: AppUser[] = [];
        snapshot.forEach((d) => {
          userList.push({ id: d.id, ...d.data() } as AppUser);
        });

        // Remove duplicatas em memória por email
        const uniqueMap = new Map<string, AppUser>();
        userList.forEach((u) => {
          const emailKey = (u.email || '').toLowerCase().trim();
          if (!uniqueMap.has(emailKey) || u.status === 'Ativo') {
            uniqueMap.set(emailKey, u);
          }
        });
        const dedupedUsers = Array.from(uniqueMap.values());

        setUsuarios(dedupedUsers);
        setCachedCollection('usuarios', dedupedUsers, tenantKey);

        // Se houver sessão autenticada, mantém dados do usuário atual sincronizados
        if (currentUser) {
          const found = dedupedUsers.find((u) => u.id === currentUser.id || u.email === currentUser.email);
          if (found && (found.nome !== currentUser.nome || found.perfil !== currentUser.perfil || found.status !== currentUser.status || found.senhaProvisoria !== currentUser.senhaProvisoria)) {
            setCurrentUser(found);
            if (typeof window !== 'undefined') {
              localStorage.setItem('gestao_eleitoral_cached_user', JSON.stringify(found));
            }
          }
        }
      },
      (err) => {
        if (!isSubscribed) return;
        handleFirestoreError(err, OperationType.LIST, 'usuarios', tenantKey);
        const cached = getCachedCollection<AppUser>('usuarios', undefined, tenantKey);
        if (cached?.data && cached.data.length > 0) {
          setUsuarios(cached.data);
        }
      }
    );

    return () => {
      isSubscribed = false;
      unsubUsers();
    };
  }, [currentUserId, isAuthReady, currentUser, tenantKey, tenantVersion, activeDb, isLoadingTenant]);

  // 3. Listen for audit logs (otimizado: apenas os últimos 20 logs)
  useEffect(() => {
    if (!isAuthReady || !currentUserId || isLoadingTenant) {
      return;
    }

    if (isCircuitBroken('logs_auditoria', tenantKey)) {
      return;
    }

    const targetDb = activeDb || getActiveDb();
    const qLogs = query(
      collection(targetDb, 'logs_auditoria'),
      orderBy('data', 'desc'),
      limit(20)
    );
    let isSubscribed = true;

    const unsubLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        if (!isSubscribed) return;
        const logList: LogAuditoria[] = [];
        snapshot.forEach((d) => {
          logList.push({ id: d.id, ...d.data() } as LogAuditoria);
        });
        setLogs(logList);
      },
      (error) => {
        if (!isSubscribed) return;
        handleFirestoreError(error, OperationType.LIST, 'logs_auditoria', tenantKey);
      }
    );

    return () => {
      isSubscribed = false;
      unsubLogs();
    };
  }, [currentUserId, isAuthReady, tenantKey, tenantVersion, activeDb, isLoadingTenant]);

  // Central log recorder
  const registrarLog = useCallback(
    async (params: {
      tipo: LogTipo;
      acao: string;
      detalhes?: string;
      entidade?: string;
      entidadeId?: string;
    }) => {
      try {
        const user = currentUser || {
          id: 'anonimo',
          nome: 'Usuário do Sistema',
          email: 'sistema@campanha.com',
          perfil: 'Operador' as UserRole
        };

        const payload = {
          tipo: params.tipo,
          usuarioId: user.id,
          usuarioNome: user.nome,
          usuarioEmail: user.email,
          usuarioPerfil: user.perfil,
          acao: params.acao,
          detalhes: params.detalhes || '',
          entidade: params.entidade || 'Sistema',
          entidadeId: params.entidadeId || '',
          subdomain: tenantKey
        };

        const targetDb = activeDb || getActiveDb();
        const targetAuth = activeAuth || getActiveAuth();

        if (targetAuth.currentUser && user.perfil === 'Administrador' && !isCircuitBroken('logs_auditoria', tenantKey)) {
          try {
            await addDoc(collection(targetDb, 'logs_auditoria'), {
              ...payload,
              data: serverTimestamp()
            });
          } catch {
            await fetch('/api/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(() => {});
          }
        } else {
          await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }

        // Notifica em tempo real a Central de Alertas (ícone do sino)
        // Apenas para alterações e exclusões (sem cadastros ou eventos internos de firestore)
        if (typeof window !== 'undefined' && (params.tipo === 'ALTERACAO' || params.tipo === 'EXCLUSAO')) {
          try {
            window.dispatchEvent(
              new CustomEvent('app:notification', {
                detail: {
                  type: params.tipo === 'ALTERACAO' ? 'info' : 'warn',
                  title: params.acao,
                  message: params.detalhes || params.acao,
                  details: `Registro auditado: ${params.entidade || 'Sistema'}`,
                  tipo: params.tipo
                }
              })
            );
          } catch {}
        }
      } catch (err) {
        console.warn('Registro de log completado em contingência:', err);
      }
    },
    [currentUser]
  );

  // Login method via Firebase Custom Token ou autenticação segura integrada
  const login = useCallback(
    async (emailInput: string, senhaInput: string, rememberMe: boolean = true) => {
      const cleanEmail = emailInput.trim().toLowerCase();
      const cleanSenha = senhaInput.trim();

      if (!cleanEmail || !cleanSenha) {
        return { success: false, error: 'Por favor, informe seu e-mail e sua senha de acesso.' };
      }

      try {
        // 1. Valida credenciais no servidor
        const response = await fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            senha: cleanSenha,
            subdomain: tenantKey
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          await registrarLog({
            tipo: 'ACESSO',
            acao: `Tentativa de login falhou: ${cleanEmail}`,
            detalhes: data.error || 'Credenciais inválidas.',
            entidade: 'Autenticação'
          });
          return {
            success: false,
            error: data.error || 'E-mail ou senha incorretos. Verifique suas credenciais.'
          };
        }

        // 2. Se o servidor retornou um Custom Token, tenta autenticar no Firebase Auth
        if (data.customToken) {
          try {
            const targetAuth = activeAuth || getActiveAuth();
            await signInWithCustomToken(targetAuth, data.customToken);
          } catch (customTokenErr) {
            console.warn('Aviso de sessão Firebase Auth, autenticando em modo seguro local:', customTokenErr);
          }
        }

        const authenticatedUser: AppUser = data.user;
        setCurrentUser(authenticatedUser);

        if (typeof window !== 'undefined') {
          localStorage.removeItem('gestao_eleitoral_logged_out');
          localStorage.setItem('gestao_eleitoral_cached_user', JSON.stringify(authenticatedUser));
          if (authenticatedUser.perfil === 'Administrador') {
            const adminData = JSON.stringify({
              id: authenticatedUser.id,
              nome: authenticatedUser.nome,
              email: authenticatedUser.email,
              perfil: authenticatedUser.perfil
            });
            localStorage.setItem('adti_admin_master_user', adminData);
            sessionStorage.setItem('adti_admin_master_user', adminData);
          }
          if (rememberMe) {
            localStorage.setItem('gestao_eleitoral_user_id', authenticatedUser.id);
          } else {
            sessionStorage.setItem('gestao_eleitoral_user_id', authenticatedUser.id);
            localStorage.removeItem('gestao_eleitoral_user_id');
          }
        }

        // Atualização de último acesso
        try {
          const targetDb = activeDb || getActiveDb();
          await updateDoc(doc(targetDb, 'usuarios', authenticatedUser.id), {
            ultimoAcesso: serverTimestamp()
          }).catch(() => {});
        } catch {}

        await registrarLog({
          tipo: 'ACESSO',
          acao: `Login efetuado com sucesso: ${authenticatedUser.nome} (${authenticatedUser.perfil})`,
          detalhes: `Sessão ativa para o usuário ${authenticatedUser.id}.`,
          entidade: 'Usuário',
          entidadeId: authenticatedUser.id
        });

        return { success: true };
      } catch (err: any) {
        console.error('Erro na autenticação:', err);
        return {
          success: false,
          error: err?.message || 'Falha ao autenticar sessão com o servidor. Tente novamente.'
        };
      }
    },
    [registrarLog]
  );

  // Logout method
  const logout = useCallback(async () => {
    const user = currentUser;
    if (user) {
      await registrarLog({
        tipo: 'ACESSO',
        acao: `Logout / Encerramento de sessão: ${user.nome}`,
        detalhes: `Sessão encerrada voluntariamente pelo usuário.`,
        entidade: 'Usuário',
        entidadeId: user.id
      });
    }

    try {
      const targetAuth = activeAuth || getActiveAuth();
      await signOut(targetAuth);
    } catch {}

    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gestao_eleitoral_user_id');
      localStorage.removeItem('gestao_eleitoral_cached_user');
      localStorage.removeItem('adti_admin_master_user');
      sessionStorage.removeItem('adti_admin_master_user');
      sessionStorage.removeItem('gestao_eleitoral_user_id');
      localStorage.setItem('gestao_eleitoral_logged_out', 'true');
    }
  }, [currentUser, registrarLog]);

  const switchUser = useCallback(
    async () => {
      console.warn('Tentativa de troca rápida de usuário bloqueada por política de segurança.');
      throw new Error('A troca direta de usuário está desativada por segurança. Por favor, saia do sistema e faça login com e-mail e senha.');
    },
    []
  );

  // Register new user (Admin only) com criptografia PBKDF2 + Salt
  const cadastrarUsuario = useCallback(
    async (data: Omit<AppUser, 'id' | 'dataCadastro'>) => {
      const rawPassword =
        data.senha && data.senha.trim()
          ? data.senha.trim()
          : data.perfil === 'Administrador'
          ? 'admin'
          : 'operador';

      const hashedPassword = await hashPassword(rawPassword);
      const targetDb = activeDb || getActiveDb();

      const docRef = await addDoc(collection(targetDb, 'usuarios'), {
        ...data,
        senha: hashedPassword,
        dataCadastro: serverTimestamp(),
        ultimoAcesso: null
      });

      // Atualiza lista em cache
      const newUser: AppUser = {
        id: docRef.id,
        ...data,
        senha: hashedPassword,
        dataCadastro: new Date().toISOString()
      };
      setUsuarios((prev) => {
        const updated = [newUser, ...prev];
        setCachedCollection('usuarios', updated, tenantKey);
        return updated;
      });

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: `Cadastro de novo usuário: ${data.nome} (${data.perfil})`,
        detalhes: `E-mail: ${data.email} | Perfil: ${data.perfil} | Status: ${data.status} (Senha criptografada com Salt)`,
        entidade: 'Usuário',
        entidadeId: docRef.id
      });

      return docRef.id;
    },
    [registrarLog, activeDb, tenantKey]
  );

  // Update existing user com criptografia PBKDF2 + Salt se a senha for alterada
  const atualizarUsuario = useCallback(
    async (id: string, data: Partial<AppUser>) => {
      const updateData = { ...data };
      if (data.senha && data.senha.trim()) {
        updateData.senha = await hashPassword(data.senha.trim());
      }

      setUsuarios((prev) => {
        const updated = prev.map((u) => (u.id === id ? { ...u, ...updateData } : u));
        setCachedCollection('usuarios', updated, tenantKey);
        return updated;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        await updateDoc(doc(targetDb, 'usuarios', id), updateData);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `usuarios/${id}`);
      }

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: `Atualização cadastral do usuário ID ${id}`,
        detalhes: `Dados alterados: ${Object.keys(data).join(', ')}${data.senha ? ' (Nova senha criptografada com Salt)' : ''}`,
        entidade: 'Usuário',
        entidadeId: id
      });
    },
    [registrarLog, activeDb, tenantKey]
  );

  // Excluir usuário com confirmação de senha mestre
  const excluirUsuario = useCallback(
    async (id: string, senhaMestre?: string) => {
      if (senhaMestre) {
        const isMasterValid = await verifyPassword(senhaMestre.trim(), systemConfig.senhaMestre);
        if (!isMasterValid) {
          throw new Error('Senha mestre incorreta! A exclusão foi negada.');
        }
      }
      const targetUser = usuarios.find((u) => u.id === id);

      setUsuarios((prev) => {
        const updated = prev.filter((u) => u.id !== id);
        setCachedCollection('usuarios', updated, tenantKey);
        return updated;
      });

      try {
        const targetDb = activeDb || getActiveDb();
        await deleteDoc(doc(targetDb, 'usuarios', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `usuarios/${id}`);
      }

      await registrarLog({
        tipo: 'EXCLUSAO',
        acao: `Exclusão do usuário: ${targetUser ? targetUser.nome : id}`,
        detalhes: `Autorizado com Senha Mestre. Usuário excluído: ${targetUser?.email || id}`,
        entidade: 'Usuário',
        entidadeId: id
      });
    },
    [systemConfig.senhaMestre, usuarios, registrarLog, activeDb, tenantKey]
  );

  // Atualizar senha mestre com criptografia PBKDF2 + Salt
  const atualizarSenhaMestre = useCallback(
    async (novaSenha: string) => {
      if (!novaSenha || novaSenha.trim().length < 4) {
        throw new Error('A nova senha mestre deve conter no mínimo 4 caracteres.');
      }
      const hashedPassword = await hashPassword(novaSenha.trim());
      const targetDb = activeDb || getActiveDb();
      const configDocRef = doc(targetDb, 'configuracoes', 'geral');

      setSystemConfig((prev) => {
        const updated = { ...prev, senhaMestre: hashedPassword };
        if (typeof window !== 'undefined') {
          localStorage.setItem(`adti_cache_${tenantKey}_configuracoes`, JSON.stringify(updated));
        }
        return updated;
      });

      try {
        await updateDoc(configDocRef, {
          senhaMestre: hashedPassword,
          atualizadoPor: currentUser?.nome || 'Administrador',
          dataAtualizacao: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'configuracoes/geral');
      }

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: 'Alteração da Senha Mestre do Sistema',
        detalhes: `A senha mestre de exclusões foi redefinida com sucesso com Salt criptográfico pelo administrador ${currentUser?.nome || ''}.`,
        entidade: 'Configurações'
      });
    },
    [currentUser, registrarLog, activeDb, tenantKey]
  );

  // Atualizar configurações gerais
  const atualizarConfiguracoes = useCallback(
    async (dados: Partial<SystemConfig>) => {
      const targetDb = activeDb || getActiveDb();
      const configDocRef = doc(targetDb, 'configuracoes', 'geral');

      setSystemConfig((prev) => {
        const updated = { ...prev, ...dados };
        if (typeof window !== 'undefined') {
          localStorage.setItem(`adti_cache_${tenantKey}_configuracoes`, JSON.stringify(updated));
        }
        return updated;
      });

      try {
        await updateDoc(configDocRef, {
          ...dados,
          atualizadoPor: currentUser?.nome || 'Administrador',
          dataAtualizacao: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'configuracoes/geral');
      }

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: 'Atualização de Configurações Gerais',
        detalhes: `Parâmetros alterados: ${Object.keys(dados).join(', ')}`,
        entidade: 'Configurações'
      });
    },
    [currentUser, registrarLog, activeDb, tenantKey]
  );

  const validarSenhaMestre = useCallback(
    async (senha: string) => {
      if (!senha || !senha.trim()) return false;
      return await verifyPassword(senha.trim(), systemConfig.senhaMestre);
    },
    [systemConfig.senhaMestre]
  );

  const solicitarSenhaMestre = useCallback((options: MasterPasswordPromptOptions) => {
    setActivePrompt(options);
  }, []);

  const fecharSolicitacaoSenhaMestre = useCallback(() => {
    setActivePrompt(null);
  }, []);

  const isAdmin = useMemo(() => {
    return currentUser?.perfil === 'Administrador';
  }, [currentUser]);

  const isAuthenticated = useMemo(() => {
    return !!currentUser;
  }, [currentUser]);

  const value = useMemo(
    () => ({
      currentUser,
      usuarios,
      logs,
      systemConfig,
      isLoading,
      isAuthReady,
      isAdmin,
      isAuthenticated,
      login,
      logout,
      switchUser,
      cadastrarUsuario,
      atualizarUsuario,
      excluirUsuario,
      atualizarSenhaMestre,
      atualizarConfiguracoes,
      validarSenhaMestre,
      registrarLog,
      solicitarSenhaMestre,
      fecharSolicitacaoSenhaMestre,
      activePrompt
    }),
    [
      currentUser,
      usuarios,
      logs,
      systemConfig,
      isLoading,
      isAuthReady,
      isAdmin,
      isAuthenticated,
      login,
      logout,
      switchUser,
      cadastrarUsuario,
      atualizarUsuario,
      excluirUsuario,
      atualizarSenhaMestre,
      atualizarConfiguracoes,
      validarSenhaMestre,
      registrarLog,
      solicitarSenhaMestre,
      fecharSolicitacaoSenhaMestre,
      activePrompt
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
