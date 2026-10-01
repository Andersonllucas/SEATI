'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { signInWithCustomToken, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getCentralDb,
  getCentralAuth,
  setActiveTenant,
  getTenantClientStats,
  bootstrapTenantDatabase,
  exportTenantBackup,
  restoreTenantBackup,
  recordCentralAuditLog,
  getCentralAuditLogs,
  testTenantConnectionWithLatency
} from '@/lib/firebase';
import {
  TenantClient,
  TenantFirebaseConfig,
  TenantStats,
  TenantStatus,
  TenantBootstrapOptions,
  TenantBootstrapResult,
  TenantBackupData,
  TenantRestoreOptions,
  TenantRestoreResult,
  TenantAuditLog
} from '@/lib/tenantTypes';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';
import { handleFirestoreError, OperationType } from '@/lib/firestoreErrors';
import {
  Shield,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  Power,
  RefreshCw,
  Users,
  Award,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  Database,
  Lock,
  Mail,
  Loader2,
  LogOut,
  Sparkles,
  ClipboardPaste,
  Server,
  LogIn,
  Wand2,
  Download,
  Copy,
  Check,
  KeyRound,
  Upload,
  Activity,
  FileText,
  RotateCcw,
  History
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';

const DEFAULT_FORM_CONFIG: TenantFirebaseConfig = {
  projectId: '',
  apiKey: '',
  authDomain: '',
  appId: '',
  firestoreDatabaseId: '(default)',
  storageBucket: '',
  messagingSenderId: ''
};

const AUTHORIZED_MASTER_EMAIL = (
  process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ||
  process.env.MASTER_ADMIN_EMAIL ||
  'LucasFernandes819@gmail.com'
).trim().toLowerCase();

function isAuthorizedMasterUser(user?: { email?: string | null; perfil?: string | null } | null): boolean {
  if (!user || user.perfil !== 'Administrador') return false;
  const email = (user.email || '').trim().toLowerCase();
  if (AUTHORIZED_MASTER_EMAIL) {
    return email === AUTHORIZED_MASTER_EMAIL;
  }
  return true;
}

export default function AdminMasterPage() {
  const { subdomain: activeSubdomain } = useTenant();

  // Garante o título PAINEL na aba do navegador
  useEffect(() => {
    document.title = 'PAINEL';
  }, []);

  // Autenticação master
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(true);
  const [adminUser, setAdminUser] = useState<{ id: string; nome: string; email: string; perfil: string } | null>(null);
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Lista de clientes
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');

  const [enteringClientSubdomain, setEnteringClientSubdomain] = useState<string | null>(null);

  const handleAccessInCurrentTab = async (client: TenantClient) => {
    setEnteringClientSubdomain(client.subdominio);
    try {
      // 1. Autoriza sessão de suporte via rota de impersonação segura
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: client.subdominio,
          masterUser: adminUser
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        alert(data.error || 'Não foi possível entrar no painel deste cliente.');
        setEnteringClientSubdomain(null);
        return;
      }

      // 2. Grava estado de impersonação e subdomínio ativo no storage e cookies
      if (typeof window !== 'undefined') {
        localStorage.setItem('adti_impersonating_tenant', client.subdominio);
        localStorage.setItem('adti_impersonating_client', JSON.stringify(client));
        localStorage.setItem('adti_active_subdomain', client.subdominio);
        document.cookie = `adti_subdomain=${client.subdominio}; path=/; max-age=31536000; SameSite=Lax`;
        localStorage.removeItem('gestao_eleitoral_logged_out');

        // Salva o usuário autenticado de suporte master para evitar tela de login do cliente
        if (data.user) {
          localStorage.setItem('gestao_eleitoral_cached_user', JSON.stringify(data.user));
          sessionStorage.setItem('gestao_eleitoral_user_id', data.user.id);
        }

        // Ativa o bundle Firebase correspondente para este cliente
        setActiveTenant(client.subdominio, client.firebaseConfig);

        // 3. Redireciona para o painel de campanha do cliente
        const hostname = window.location.hostname.toLowerCase().trim();
        if (hostname.endsWith('.adti.app.br')) {
          window.location.href = `https://${client.subdominio}.adti.app.br/`;
        } else {
          window.location.href = `/?subdomain=${encodeURIComponent(client.subdominio)}`;
        }
      }
    } catch (err: any) {
      console.error('Erro ao acessar painel do cliente:', err);
      alert('Falha ao conectar com o banco de dados do cliente.');
      setEnteringClientSubdomain(null);
    }
  };

  // Cache de métricas ao vivo por cliente
  const [statsCache, setStatsCache] = useState<Record<string, TenantStats>>({});
  const [loadingStatsSubdomain, setLoadingStatsSubdomain] = useState<string | null>(null);

  // Modal de cadastro/edição
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<TenantClient | null>(null);
  const [formNome, setFormNome] = useState<string>('');
  const [formSubdominio, setFormSubdominio] = useState<string>('');
  const [formStatus, setFormStatus] = useState<TenantStatus>('ativo');
  const [formFirebase, setFormFirebase] = useState<TenantFirebaseConfig>(DEFAULT_FORM_CONFIG);
  const [jsonPaste, setJsonPaste] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testConnectionStatus, setTestConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  // Estados do Modal de Provisionamento / Bootstrap (Parte 4)
  const [bootstrapTargetClient, setBootstrapTargetClient] = useState<TenantClient | null>(null);
  const [isBootstrapModalOpen, setIsBootstrapModalOpen] = useState<boolean>(false);
  const [bootstrapAdminNome, setBootstrapAdminNome] = useState<string>('');
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState<string>('');
  const [bootstrapAdminSenha, setBootstrapAdminSenha] = useState<string>('');
  const [bootstrapOperadorNome, setBootstrapOperadorNome] = useState<string>('');
  const [bootstrapOperadorEmail, setBootstrapOperadorEmail] = useState<string>('');
  const [bootstrapOperadorSenha, setBootstrapOperadorSenha] = useState<string>('123456');
  const [bootstrapMetaVotos, setBootstrapMetaVotos] = useState<number>(5000);
  const [bootstrapImportarLocais, setBootstrapImportarLocais] = useState<boolean>(true);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [bootstrapResult, setBootstrapResult] = useState<TenantBootstrapResult | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState<boolean>(false);

  // Estado de exportação de backup (Parte 4)
  const [exportingSubdomain, setExportingSubdomain] = useState<string | null>(null);

  // Aba ativa do Painel Master (Parte 8)
  const [activeMasterTab, setActiveMasterTab] = useState<'clientes' | 'auditoria' | 'saude'>('clientes');

  // Estados do Modal de Restauração de Backup (Parte 8)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTargetClient, setRestoreTargetClient] = useState<TenantClient | null>(null);
  const [restoreBackupData, setRestoreBackupData] = useState<TenantBackupData | null>(null);
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [isReadingRestoreFile, setIsReadingRestoreFile] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreOptions, setRestoreOptions] = useState<TenantRestoreOptions>({
    restoreEleitores: true,
    restoreLiderancas: true,
    restoreLocais: true,
    restoreUsuarios: true,
    restoreConfiguracoes: true
  });
  const [restoreResult, setRestoreResult] = useState<TenantRestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Estados da Central de Auditoria (Parte 8)
  const [auditLogs, setAuditLogs] = useState<TenantAuditLog[]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState<boolean>(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('todos');

  // Estados de Diagnóstico de Conexão e Latência (Parte 8)
  const [healthResults, setHealthResults] = useState<Record<string, { success: boolean; message: string; latencyMs: number }>>({});
  const [isCheckingAllHealth, setIsCheckingAllHealth] = useState<boolean>(false);

  // 1. Verifica sessão ativa com o Firebase Auth Central ou sessão armazenada
  useEffect(() => {
    // Restaura sessão salva no navegador imediatamente
    if (typeof window !== 'undefined') {
      const savedMasterStr = sessionStorage.getItem('adti_admin_master_user') || localStorage.getItem('adti_admin_master_user');
      const cachedAppUserStr = localStorage.getItem('gestao_eleitoral_cached_user');

      let foundAdmin: any = null;
      if (savedMasterStr) {
        try {
          const parsed = JSON.parse(savedMasterStr);
          if (parsed && isAuthorizedMasterUser(parsed)) {
            foundAdmin = parsed;
          }
        } catch {}
      }

      if (!foundAdmin && cachedAppUserStr) {
        try {
          const parsed = JSON.parse(cachedAppUserStr);
          if (parsed && parsed.status !== 'Inativo' && isAuthorizedMasterUser(parsed)) {
            foundAdmin = {
              id: parsed.id,
              nome: parsed.nome,
              email: parsed.email,
              perfil: parsed.perfil
            };
          }
        } catch {}
      }

      if (foundAdmin) {
        setAdminUser(foundAdmin);
        setIsAuthenticated(true);
        setIsVerifyingSession(false);
      }
    }

    const centralAuth = getCentralAuth();
    const centralDb = getCentralDb();

    const unsubscribe = onAuthStateChanged(centralAuth, async (fbUser) => {
      if (fbUser) {
        try {
          // Busca o perfil do usuário em `usuarios/{uid}` no projeto central
          const userSnap = await getDoc(doc(centralDb, 'usuarios', fbUser.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            const u = {
              id: fbUser.uid,
              nome: data.nome || 'Administrador Master',
              email: data.email || fbUser.email || '',
              perfil: data.perfil
            };
            if (data.status !== 'Inativo' && isAuthorizedMasterUser(u)) {
              setAdminUser(u);
              setIsAuthenticated(true);
              setIsVerifyingSession(false);
              if (typeof window !== 'undefined') {
                localStorage.setItem('adti_admin_master_user', JSON.stringify(u));
              }
              return;
            }
          }
        } catch (err) {
          console.error('Erro ao verificar permissão do usuário master:', err);
        }
      }
      setIsVerifyingSession(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanPassword = passwordInput.trim();

    if (!cleanEmail || !cleanPassword) {
      setAuthError('Informe o e-mail e a senha do Administrador.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // Reaproveita o endpoint /api/auth/token que valida as credenciais contra a coleção `usuarios` central
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, senha: cleanPassword })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setAuthError(data.error || 'Credenciais inválidas. Verifique seu e-mail e senha.');
        setIsLoggingIn(false);
        return;
      }

      // Validação estrita: somente perfil Administrador tem acesso ao painel master
      if (data.user?.perfil !== 'Administrador') {
        setAuthError('Acesso negado. Apenas usuários com perfil "Administrador" têm permissão para acessar o Painel Master.');
        setIsLoggingIn(false);
        return;
      }

      // Validação estrita: somente o e-mail master configurado tem permissão
      if (!isAuthorizedMasterUser(data.user)) {
        setAuthError(`Acesso negado. O e-mail (${data.user?.email}) não possui autorização para acessar o Painel Master.`);
        setIsLoggingIn(false);
        return;
      }

      // Tenta autenticar no Firebase Auth caso haja customToken válido (sem travar se falhar)
      if (data.customToken) {
        try {
          const centralAuth = getCentralAuth();
          await signInWithCustomToken(centralAuth, data.customToken);
        } catch (tokenErr) {
          console.warn('[AdminMaster] Aviso ao registrar sessão no Firebase Auth:', tokenErr);
        }
      }

      const adminSessionUser = {
        id: data.user.id,
        nome: data.user.nome,
        email: data.user.email,
        perfil: data.user.perfil
      };

      setAdminUser(adminSessionUser);
      setIsAuthenticated(true);
      setPasswordInput('');

      if (typeof window !== 'undefined') {
        localStorage.setItem('adti_admin_master_user', JSON.stringify(adminSessionUser));
        sessionStorage.setItem('adti_admin_master_user', JSON.stringify(adminSessionUser));
      }
    } catch (err: any) {
      console.error('Erro ao autenticar no painel master:', err);
      setAuthError(err?.message || 'Falha ao autenticar com o servidor. Tente novamente.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      const centralAuth = getCentralAuth();
      await signOut(centralAuth);
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adti_admin_master_user');
      sessionStorage.removeItem('adti_admin_master_user');
      localStorage.removeItem('gestao_eleitoral_cached_user');
      localStorage.removeItem('gestao_eleitoral_user_id');
      sessionStorage.removeItem('gestao_eleitoral_user_id');
      localStorage.setItem('gestao_eleitoral_logged_out', 'true');
    }
    setIsAuthenticated(false);
    setAdminUser(null);
  };

  // 2. Carrega clientes do clientes_registry em tempo real
  useEffect(() => {
    if (!isAuthenticated) return;

    setIsLoadingClients(true);

    // Carregamento rápido inicial via API REST do servidor
    fetch('/api/admin/clients')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.clients) && d.clients.length > 0) {
          setClients(d.clients);
          setIsLoadingClients(false);
        }
      })
      .catch(() => {});

    const centralDb = getCentralDb();
    const q = query(collection(centralDb, 'clientes_registry'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TenantClient[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as TenantClient);
        });
        setClients(list);
        setIsLoadingClients(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clientes_registry');
        // Fallback garantido via API REST em caso de regras restritas no cliente
        fetch('/api/admin/clients')
          .then((r) => r.json())
          .then((d) => {
            if (d.success && Array.isArray(d.clients)) {
              setClients(d.clients);
            }
          })
          .catch(() => {})
          .finally(() => setIsLoadingClients(false));
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated]);

  // 3. Consultar métricas ao vivo no Firebase de um cliente
  const fetchClientStats = async (client: TenantClient) => {
    setLoadingStatsSubdomain(client.subdominio);
    try {
      const stats = await getTenantClientStats(client.firebaseConfig);
      setStatsCache((prev) => ({
        ...prev,
        [client.subdominio]: stats
      }));
    } catch (err: any) {
      setStatsCache((prev) => ({
        ...prev,
        [client.subdominio]: {
          eleitoresCount: 0,
          liderancasCount: 0,
          locaisCount: 0,
          status: 'error',
          errorMessage: err?.message || 'Falha ao conectar'
        }
      }));
    } finally {
      setLoadingStatsSubdomain(null);
    }
  };

  // 4. Alternar status ativo/inativo
  const toggleClientStatus = async (client: TenantClient) => {
    const newStatus: TenantStatus = client.status === 'ativo' ? 'inativo' : 'ativo';

    // 1. Atualização otimista na interface do Master
    setClients((prev) =>
      prev.map((c) => (c.id === client.id ? { ...c, status: newStatus } : c))
    );

    try {
      // 2. Salva via API segura no servidor
      await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          nome: client.nome,
          subdominio: client.subdominio,
          status: newStatus,
          firebaseConfig: client.firebaseConfig
        })
      }).catch((err) => console.warn('Aviso ao sincronizar via API:', err));

      // 3. Atualiza diretamente no Firestore central via SDK para disparo imediato dos listeners
      try {
        const centralDb = getCentralDb();
        await updateDoc(doc(centralDb, 'clientes_registry', client.id), {
          status: newStatus,
          atualizadoEm: serverTimestamp()
        });
      } catch (dbErr) {
        console.warn('Atualização direta no Firestore central:', dbErr);
      }

      // 4. Grava auditoria (Parte 8)
      recordCentralAuditLog({
        tenantSubdominio: client.subdominio,
        tenantNome: client.nome,
        autorEmail: adminUser?.email || 'admin@master',
        acao: 'status_alterado',
        detalhes: `Status do cliente alterado para "${newStatus}".`
      });
    } catch (err: any) {
      // Reverte em caso de erro crítico
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, status: client.status } : c))
      );
      alert(`Erro ao alterar status: ${err?.message || 'Verifique as permissões do Firebase'}`);
    }
  };

  // 5. Excluir cliente
  const handleDeleteClient = async (client: TenantClient) => {
    if (
      !confirm(
        `Tem certeza que deseja remover o cliente "${client.nome}" (${client.subdominio}.adti.app.br)? Esta ação remove o apontamento de subdomínio.`
      )
    ) {
      return;
    }

    try {
      // 1. Tenta exclusão via API segura no servidor
      const res = await fetch(`/api/admin/clients?id=${encodeURIComponent(client.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // 2. Fallback direto no Firestore do navegador
        const centralDb = getCentralDb();
        await deleteDoc(doc(centralDb, 'clientes_registry', client.id));
      }

      // Grava auditoria (Parte 8)
      recordCentralAuditLog({
        tenantSubdominio: client.subdominio,
        tenantNome: client.nome,
        autorEmail: adminUser?.email || 'admin@master',
        acao: 'exclusao',
        detalhes: `Cliente "${client.nome}" (${client.subdominio}) removido do registry.`
      });
    } catch (err: any) {
      alert(`Erro ao excluir: ${err?.message || 'Verifique as permissões do Firebase'}`);
    }
  };

  // 6. Abertura do Modal de Cadastro / Edição
  const openNewClientModal = () => {
    setEditingClient(null);
    setFormNome('');
    setFormSubdominio('');
    setFormStatus('ativo');
    setFormFirebase({ ...DEFAULT_FORM_CONFIG });
    setJsonPaste('');
    setFormError(null);
    setTestConnectionStatus(null);
    setIsModalOpen(true);
  };

  const openEditClientModal = (client: TenantClient) => {
    setEditingClient(client);
    setFormNome(client.nome);
    setFormSubdominio(client.subdominio);
    setFormStatus(client.status);
    setFormFirebase({ ...client.firebaseConfig });
    setJsonPaste('');
    setFormError(null);
    setTestConnectionStatus(null);
    setIsModalOpen(true);
  };

  // 7. Auto-preenchimento ao colar JSON do Firebase
  const handleParseJsonPaste = () => {
    if (!jsonPaste.trim()) return;
    try {
      // Remove declarações js como `const firebaseConfig =` se houver
      let cleanJson = jsonPaste.trim();
      if (cleanJson.includes('=')) {
        cleanJson = cleanJson.substring(cleanJson.indexOf('=') + 1);
      }
      if (cleanJson.endsWith(';')) {
        cleanJson = cleanJson.slice(0, -1);
      }

      // Converte chaves sem aspas para JSON válido se necessário
      const formatted = cleanJson.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      const parsed = JSON.parse(formatted);

      setFormFirebase((prev) => ({
        ...prev,
        projectId: parsed.projectId || prev.projectId,
        apiKey: parsed.apiKey || prev.apiKey,
        authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        appId: parsed.appId || prev.appId,
        firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
        storageBucket: parsed.storageBucket || `${parsed.projectId}.firebasestorage.app`,
        messagingSenderId: parsed.messagingSenderId || prev.messagingSenderId
      }));

      setTestConnectionStatus({
        tested: true,
        success: true,
        message: 'Configuração importada com sucesso do JSON!'
      });
    } catch {
      setFormError('Formato JSON inválido. Verifique o texto colado.');
    }
  };

  // 8. Teste de conexão ao vivo antes de salvar
  const handleTestConnection = async () => {
    if (!formFirebase.projectId || !formFirebase.apiKey) {
      setFormError('Preencha ao menos o Project ID e a API Key para testar a conexão.');
      return;
    }

    setTestConnectionStatus({
      tested: false,
      success: false,
      message: 'Testando conexão com o Firebase do cliente...'
    });

    try {
      const stats = await getTenantClientStats(formFirebase);
      if (stats.status === 'ok') {
        setTestConnectionStatus({
          tested: true,
          success: true,
          message: `Conexão bem-sucedida! Banco alcançável (${stats.eleitoresCount} eleitores, ${stats.liderancasCount} lideranças).`
        });
        setFormError(null);
      } else {
        setTestConnectionStatus({
          tested: true,
          success: false,
          message: `Falha na conexão: ${stats.errorMessage || 'Verifique as chaves e regras'}`
        });
      }
    } catch (err: any) {
      setTestConnectionStatus({
        tested: true,
        success: false,
        message: `Erro ao testar conexão: ${err?.message}`
      });
    }
  };

  // 9. Salvar cliente no clientes_registry
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanNome = formNome.trim();
    const cleanSub = formSubdominio
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');

    if (!cleanNome) {
      setFormError('O nome do cliente ou campanha é obrigatório.');
      return;
    }
    if (!cleanSub) {
      setFormError('O subdomínio é obrigatório (apenas letras minúsculas, números e hífens).');
      return;
    }
    if (cleanSub === 'admin') {
      setFormError('O subdomínio "admin" é reservado exclusivamente para o painel master.');
      return;
    }
    if (!formFirebase.projectId || !formFirebase.apiKey || !formFirebase.appId) {
      setFormError('Preencha os campos obrigatórios do Firebase: Project ID, API Key e App ID.');
      return;
    }

    setIsSaving(true);
    const docId = editingClient ? editingClient.id : cleanSub;
    const clientPayload = {
      id: docId,
      nome: cleanNome,
      subdominio: cleanSub,
      status: formStatus,
      firebaseConfig: {
        projectId: formFirebase.projectId.trim(),
        apiKey: formFirebase.apiKey.trim(),
        authDomain: formFirebase.authDomain.trim() || `${formFirebase.projectId.trim()}.firebaseapp.com`,
        appId: formFirebase.appId.trim(),
        firestoreDatabaseId: formFirebase.firestoreDatabaseId?.trim() || '(default)',
        storageBucket: formFirebase.storageBucket?.trim() || `${formFirebase.projectId.trim()}.firebasestorage.app`,
        messagingSenderId: formFirebase.messagingSenderId?.trim() || ''
      }
    };

    try {
      // 1. Tenta salvar via API do servidor (elimina problemas com regras ou tokens locais no navegador)
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setIsModalOpen(false);
        // Se for um novo cliente, provisiona automaticamente os usuários padrão (Administrador e Operador)
        if (!editingClient) {
          // Inicializa usuários padrão em segundo plano
          bootstrapTenantDatabase(clientPayload.firebaseConfig, {
            tenantId: docId,
            subdominio: cleanSub,
            nomeCampanha: cleanNome,
            adminNome: `Administrador ${cleanNome}`,
            adminEmail: `admin@${cleanSub}.local`,
            adminSenha: '123456',
            operadorNome: `Operador ${cleanNome}`,
            operadorEmail: `operador@${cleanSub}.local`,
            operadorSenha: '123456',
            importarLocais: false
          }).catch((err) => console.warn('Aviso no auto-provisionamento de usuários padrão:', err));
        }
        return;
      }

      // 2. Fallback direto no Firestore do navegador
      const centralDb = getCentralDb();
      const docRef = doc(centralDb, 'clientes_registry', docId);

      const clientData = {
        ...clientPayload,
        atualizadoEm: serverTimestamp()
      };

      if (!editingClient) {
        await setDoc(docRef, {
          ...clientData,
          criadoEm: serverTimestamp()
        });
        // Provisiona usuários padrão no novo banco
        bootstrapTenantDatabase(clientPayload.firebaseConfig, {
          tenantId: docId,
          subdominio: cleanSub,
          nomeCampanha: cleanNome,
          adminNome: `Administrador ${cleanNome}`,
          adminEmail: `admin@${cleanSub}.local`,
          adminSenha: '123456',
          operadorNome: `Operador ${cleanNome}`,
          operadorEmail: `operador@${cleanSub}.local`,
          operadorSenha: '123456',
          importarLocais: false
        }).catch((err) => console.warn('Aviso no auto-provisionamento de usuários padrão:', err));
      } else {
        await updateDoc(docRef, clientData);
      }

      // Grava auditoria (Parte 8)
      recordCentralAuditLog({
        tenantSubdominio: cleanSub,
        tenantNome: cleanNome,
        autorEmail: adminUser?.email || 'admin@master',
        acao: editingClient ? 'edicao' : 'criacao',
        detalhes: editingClient
          ? `Configurações do cliente "${cleanNome}" atualizadas no painel master.`
          : `Novo cliente "${cleanNome}" registrado com subdomínio "${cleanSub}".`
      });

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar cliente no registry:', err);
      setFormError(`Erro ao salvar: ${err?.message || 'Falha na gravação. Verifique as permissões do Firebase.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 10. Auto-inicializar cliente padrão se banco estiver vazio
  const handleSeedDefaultClient = async () => {
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'demo',
          nome: 'Campanha Teresina 2026',
          subdominio: 'demo',
          status: 'ativo',
          firebaseConfig: CENTRAL_FIREBASE_CONFIG
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert('Cliente "demo" registrado com sucesso!');
        return;
      }

      const centralDb = getCentralDb();
      await setDoc(doc(centralDb, 'clientes_registry', 'demo'), {
        nome: 'Campanha Teresina 2026',
        subdominio: 'demo',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      alert('Cliente "demo" registrado com sucesso!');
    } catch (err: any) {
      alert(`Erro: ${err?.message || 'Verifique as regras do Firebase'}`);
    }
  };

  // 11. Modal de Provisionamento / Bootstrap (Parte 4)
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pwd = 'Adti@';
    for (let i = 0; i < 6; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const openBootstrapModal = (client: TenantClient) => {
    setBootstrapTargetClient(client);
    setBootstrapAdminNome(`Administrador ${client.nome}`);
    setBootstrapAdminEmail(`admin@${client.subdominio}.adti.app.br`);
    setBootstrapAdminSenha(generateRandomPassword());
    setBootstrapOperadorNome(`Operador ${client.nome}`);
    setBootstrapOperadorEmail(`operador@${client.subdominio}.adti.app.br`);
    setBootstrapOperadorSenha('123456');
    setBootstrapMetaVotos(5000);
    setBootstrapImportarLocais(true);
    setBootstrapResult(null);
    setBootstrapError(null);
    setCopiedCredentials(false);
    setIsBootstrapModalOpen(true);
  };

  const handleExecuteBootstrap = async () => {
    if (!bootstrapTargetClient) return;

    if (!bootstrapAdminEmail.trim() || !bootstrapAdminSenha.trim()) {
      setBootstrapError('E-mail e senha do administrador inicial são obrigatórios.');
      return;
    }

    setIsBootstrapping(true);
    setBootstrapError(null);

    const options: TenantBootstrapOptions = {
      tenantId: bootstrapTargetClient.id,
      subdominio: bootstrapTargetClient.subdominio,
      nomeCampanha: bootstrapTargetClient.nome,
      adminNome: bootstrapAdminNome.trim() || `Administrador ${bootstrapTargetClient.nome}`,
      adminEmail: bootstrapAdminEmail.trim().toLowerCase(),
      adminSenha: bootstrapAdminSenha.trim(),
      operadorNome: bootstrapOperadorNome.trim() || `Operador ${bootstrapTargetClient.nome}`,
      operadorEmail: bootstrapOperadorEmail.trim().toLowerCase(),
      operadorSenha: bootstrapOperadorSenha.trim() || '123456',
      metaVotos: Number(bootstrapMetaVotos) || 5000,
      cargo: 'Prefeito / Vereador / Deputado',
      anoEleicao: '2026',
      municipio: 'Teresina',
      uf: 'PI',
      importarLocais: bootstrapImportarLocais
    };

    try {
      // 1. Tenta inicialização direta no client-side
      const res = await bootstrapTenantDatabase(bootstrapTargetClient.firebaseConfig, options);

      if (res.success) {
        setBootstrapResult(res);
        // Atualiza métricas do card imediatamente
        fetchClientStats(bootstrapTargetClient);

        // Grava auditoria (Parte 8)
        recordCentralAuditLog({
          tenantSubdominio: bootstrapTargetClient.subdominio,
          tenantNome: bootstrapTargetClient.nome,
          autorEmail: adminUser?.email || 'admin@master',
          acao: 'bootstrap',
          detalhes: `Banco provisionado com sucesso: Admin "${res.adminEmail}", locais: ${res.locaisImportados || 0}.`
        });
      } else {
        // 2. Se falhar no client, tenta via API do servidor
        const apiRes = await fetch('/api/admin/bootstrap-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firebaseConfig: bootstrapTargetClient.firebaseConfig,
            options
          })
        });
        const apiData = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && apiData.success) {
          setBootstrapResult(apiData);
          fetchClientStats(bootstrapTargetClient);

          // Grava auditoria (Parte 8)
          recordCentralAuditLog({
            tenantSubdominio: bootstrapTargetClient.subdominio,
            tenantNome: bootstrapTargetClient.nome,
            autorEmail: adminUser?.email || 'admin@master',
            acao: 'bootstrap',
            detalhes: `Banco provisionado via servidor: Admin "${apiData.adminEmail}", locais: ${apiData.locaisImportados || 0}.`
          });
        } else {
          setBootstrapError(apiData.error || res.message || 'Falha ao provisionar banco do cliente.');
        }
      }
    } catch (err: any) {
      setBootstrapError(err?.message || 'Erro inesperado durante o provisionamento.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const copyBootstrapCredentials = () => {
    if (!bootstrapTargetClient || !bootstrapResult) return;
    const text = `🏛️ ACESSO À PLATAFORMA - SEATI\nCampanha: ${bootstrapTargetClient.nome}\nLink de Acesso: https://${bootstrapTargetClient.subdominio}.adti.app.br/login\n\n👤 USUÁRIO ADMINISTRADOR:\nE-mail: ${bootstrapResult.adminEmail}\nSenha Provisória: ${bootstrapResult.adminSenha}\n\n👥 USUÁRIO OPERADOR:\nE-mail: ${bootstrapResult.operadorEmail || `operador@${bootstrapTargetClient.subdominio}.adti.app.br`}\nSenha Provisória: ${bootstrapResult.operadorSenha || '123456'}\n\n*Acesse e altere a senha provisória no primeiro login.*`;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCredentials(true);
      setTimeout(() => setCopiedCredentials(false), 2500);
    }
  };

  // 12. Exportar Backup do Tenant (Parte 4)
  const handleExportBackup = async (client: TenantClient) => {
    setExportingSubdomain(client.subdominio);
    try {
      const backupData = await exportTenantBackup(client);
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `backup_${client.subdominio}_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Grava log central de auditoria (Parte 8)
      recordCentralAuditLog({
        tenantSubdominio: client.subdominio,
        tenantNome: client.nome,
        autorEmail: adminUser?.email || 'admin@master',
        acao: 'backup_exportado',
        detalhes: `Backup consolidado exportado contendo ${backupData.metadata.totalEleitores} eleitores, ${backupData.metadata.totalLiderancas} lideranças, ${backupData.metadata.totalLocais} locais.`
      });
    } catch (err: any) {
      alert(`Falha ao exportar backup: ${err?.message || 'Verifique as permissões de leitura'}`);
    } finally {
      setExportingSubdomain(null);
    }
  };

  // 13. Modal de Restauração de Backup (Parte 8)
  const openRestoreModal = (client: TenantClient) => {
    setRestoreTargetClient(client);
    setRestoreBackupData(null);
    setRestoreFileName('');
    setRestoreError(null);
    setRestoreResult(null);
    setRestoreOptions({
      restoreEleitores: true,
      restoreLiderancas: true,
      restoreLocais: true,
      restoreUsuarios: true,
      restoreConfiguracoes: true
    });
    setIsRestoreModalOpen(true);
  };

  const handleRestoreFileSelected = async (file: File) => {
    setRestoreError(null);
    setRestoreResult(null);
    setRestoreFileName(file.name);
    setIsReadingRestoreFile(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Arquivo JSON inválido.');
      }

      // Validação de formato de backup do SEATI
      if (!parsed.metadata && !parsed.eleitores && !parsed.liderancas && !parsed.locais_votacao) {
        throw new Error('O arquivo não parece ser um backup válido do SEATI (ausência de metadados ou coleções reconhecidas).');
      }

      setRestoreBackupData(parsed as TenantBackupData);
    } catch (err: any) {
      setRestoreError(`Erro ao carregar arquivo de backup: ${err?.message || 'Formato JSON inválido'}`);
      setRestoreBackupData(null);
    } finally {
      setIsReadingRestoreFile(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreTargetClient || !restoreBackupData) return;
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const result = await restoreTenantBackup(restoreTargetClient, restoreBackupData, restoreOptions);
      setRestoreResult(result);

      if (result.success) {
        // Grava auditoria central
        await recordCentralAuditLog({
          tenantSubdominio: restoreTargetClient.subdominio,
          tenantNome: restoreTargetClient.nome,
          autorEmail: adminUser?.email || 'admin@master',
          acao: 'backup_restaurado',
          detalhes: `Backup restaurado no tenant: ${result.eleitoresRestaurados} eleitores, ${result.liderancasRestauradas} lideranças, ${result.locaisRestaurados} locais, ${result.usuariosRestaurados} usuários.`
        });

        // Recarrega contagens do cliente no cache de métricas
        fetchClientStats(restoreTargetClient);
      } else {
        setRestoreError(result.message);
      }
    } catch (err: any) {
      setRestoreError(`Falha durante restauração: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // 14. Carregar Logs de Auditoria Central (Parte 8)
  const loadAuditLogs = async () => {
    setIsLoadingAuditLogs(true);
    try {
      const logs = await getCentralAuditLogs(100);
      setAuditLogs(logs);
    } catch (err) {
      console.warn('Erro ao carregar logs centrais:', err);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  // Carrega logs de auditoria e mantém escuta em tempo real sempre que a aba é aberta
  useEffect(() => {
    if (activeMasterTab !== 'auditoria' || !isAuthenticated) return;

    loadAuditLogs();

    let unsubscribe: (() => void) | undefined;
    try {
      const centralDb = getCentralDb();
      const q = query(
        collection(centralDb, 'logs_auditoria'),
        orderBy('data', 'desc'),
        limit(100)
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const realtimeLogs = snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                timestamp: data.data || data.timestamp || new Date().toISOString(),
                tenantSubdominio: data.tenantSubdominio || data.subdominio || 'central',
                tenantNome: data.tenantNome || (data.subdominio ? `Campanha ${data.subdominio}` : 'Banco Central / Demonstração'),
                autorEmail: data.autorEmail || data.usuarioEmail || 'sistema@campanha.com',
                usuarioNome: data.usuarioNome || 'Usuário do Sistema',
                acao: data.acao || 'Ação registrada',
                detalhes: data.detalhes || '',
                tipo: data.tipo || 'SISTEMA',
                entidade: data.entidade || ''
              };
            }) as TenantAuditLog[];
            setAuditLogs(realtimeLogs);
          }
        },
        (error) => {
          console.warn('[Auditoria] Listener em tempo real:', error?.message);
        }
      );
    } catch (err) {
      console.warn('[Auditoria] Falha ao inicializar listener em tempo real:', err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeMasterTab, isAuthenticated]);

  // 15. Diagnóstico de Saúde de Todos os Clientes (Parte 8)
  const handleCheckAllHealth = async () => {
    if (clients.length === 0) return;
    setIsCheckingAllHealth(true);
    const results: Record<string, { success: boolean; message: string; latencyMs: number }> = {};

    await Promise.all(
      clients.map(async (client) => {
        try {
          const res = await testTenantConnectionWithLatency(client.firebaseConfig);
          results[client.subdominio] = res;
        } catch (e: any) {
          results[client.subdominio] = {
            success: false,
            message: e?.message || 'Falha de conexão',
            latencyMs: 9999
          };
        }
      })
    );

    setHealthResults(results);
    setIsCheckingAllHealth(false);
  };

  // Filtros
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subdominio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.firebaseConfig.projectId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'todos' ? true : statusFilter === 'ativo' ? c.status === 'ativo' : c.status === 'inativo';
    return matchesSearch && matchesStatus;
  });

  // Filtros de Auditoria (Parte 8)
  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesSearch =
      !auditSearchQuery ||
      log.tenantNome.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
      log.tenantSubdominio.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
      log.autorEmail.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
      log.detalhes.toLowerCase().includes(auditSearchQuery.toLowerCase());

    const matchesAction =
      auditActionFilter === 'todos' || log.acao === auditActionFilter;

    return matchesSearch && matchesAction;
  });

  const totalAtivos = clients.filter((c) => c.status === 'ativo').length;
  const totalInativos = clients.filter((c) => c.status === 'inativo').length;

  // VERIFICANDO SESSÃO MASTER
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center animate-pulse">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span>Verificando autenticação master...</span>
          </div>
        </div>
      </div>
    );
  }

  // TELA DE LOGIN MASTER (AUTENTICAÇÃO REAL VIA FIREBASE AUTH)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-container-low border border-outline-variant/60 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center shadow-inner">
              <Shield className="w-7 h-7" />
            </div>
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-primary/15 text-primary uppercase tracking-wider">
              admin.adti.app.br
            </span>
            <h1 className="text-2xl font-bold font-display text-on-surface">Painel Master ADTI</h1>
            <p className="text-xs text-on-surface-variant">
              Gerenciamento central de clientes, subdomínios e bancos Firebase
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                E-mail do Administrador
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="admin@campanha.com"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pl-10"
                  autoFocus
                  required
                />
                <Mail className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Senha de Acesso
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Digite sua senha de Administrador"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pl-10"
                  required
                />
                <Lock className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-3.5" />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Autenticando sessão...</span>
                </>
              ) : (
                <span>Acessar Painel Master</span>
              )}
            </button>
          </form>

          <div className="text-center space-y-1">
            <p className="text-[11px] text-on-surface-variant">
              Autenticação segura via Firebase Custom Token.
            </p>
            <p className="text-[10px] text-on-surface-variant/70">
              Requer conta com perfil <span className="font-semibold text-primary">Administrador</span> no projeto central.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // PAINEL MASTER PRINCIPAL
  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface pb-16">
      {/* Header Master */}
      <header className="sticky top-0 z-30 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant/50 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold font-display leading-tight">Painel Master ADTI</h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                  admin.adti.app.br
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">Gestão Multi-Cliente e Resolução de Subdomínios</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {adminUser && (
              <div className="hidden md:flex flex-col text-right mr-1">
                <span className="text-xs font-semibold text-on-surface">{adminUser.nome}</span>
                <span className="text-[10px] text-on-surface-variant font-mono">{adminUser.email}</span>
              </div>
            )}
            <button
              onClick={openNewClientModal}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-primary text-on-primary text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Cliente</span>
            </button>
            <button
              onClick={handleLogout}
              title="Encerrar Sessão Master"
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 text-on-surface-variant text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navegação por Abas do Painel Master (Parte 8) */}
      <div className="bg-surface-container-low border-b border-outline-variant/40 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 pt-1">
          <button
            onClick={() => setActiveMasterTab('clientes')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeMasterTab === 'clientes'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Clientes & Bancos ({clients.length})</span>
          </button>

          <button
            onClick={() => setActiveMasterTab('auditoria')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeMasterTab === 'auditoria'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Auditoria & Logs Globais</span>
          </button>

          <button
            onClick={() => setActiveMasterTab('saude')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeMasterTab === 'saude'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Diagnóstico de Saúde & Latência</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {activeMasterTab === 'clientes' && (
          <>
            {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-medium">Total de Clientes</span>
              <Server className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-display">{clients.length}</div>
            <p className="text-[11px] text-on-surface-variant mt-1">Subdomínios mapeados</p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-medium">Clientes Ativos</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-display text-emerald-600">{totalAtivos}</div>
            <p className="text-[11px] text-on-surface-variant mt-1">Acesso liberado</p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-medium">Clientes Inativos</span>
              <XCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-display text-amber-600">{totalInativos}</div>
            <p className="text-[11px] text-on-surface-variant mt-1">Acesso bloqueado</p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-xs font-medium">Banco Central</span>
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div className="text-sm font-bold font-mono text-primary truncate">
              {CENTRAL_FIREBASE_CONFIG.projectId}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate">clientes_registry ativo</p>
          </div>
        </div>

        {/* Barra de Filtro e Pesquisa */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-container-low border border-outline-variant/50 rounded-2xl p-3 sm:p-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome da campanha, subdomínio ou Project ID..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-medium">Status:</span>
            <div className="inline-flex rounded-xl bg-surface-container-lowest p-1 border border-outline-variant">
              {(['todos', 'ativo', 'inativo'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista de Clientes */}
        {isLoadingClients ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm text-on-surface-variant">Carregando lista de clientes cadastrados...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-surface-container-low border border-outline-variant/50 rounded-3xl p-8 sm:p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-container text-on-surface-variant mx-auto flex items-center justify-center">
              <Globe className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display">Nenhum cliente localizado</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                {searchQuery
                  ? 'Nenhum resultado corresponde aos critérios de pesquisa informados.'
                  : 'Nenhum cliente está registrado ainda na coleção clientes_registry.'}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={openNewClientModal}
                  className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Cadastrar Primeiro Cliente
                </button>
                <button
                  onClick={handleSeedDefaultClient}
                  className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-xs font-semibold transition-colors cursor-pointer"
                >
                  Registrar Banco Atual como &quot;demo&quot;
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => {
              const stats = statsCache[client.subdominio];
              const isLoadingStats = loadingStatsSubdomain === client.subdominio;
              const isAtivo = client.status === 'ativo';

              return (
                <div
                  key={client.id}
                  className={`bg-surface-container-low border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 ${
                    isAtivo ? 'border-outline-variant/60' : 'border-amber-500/40 bg-amber-500/5'
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold font-display truncate text-on-surface">
                            {client.nome}
                          </h3>
                          {activeSubdomain === client.subdominio && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-700 border border-blue-500/30 shrink-0">
                              <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                              Ativo no Navegador
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-primary font-mono font-medium truncate">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span>{client.subdominio}.adti.app.br</span>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide shrink-0 ${
                          isAtivo
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                        }`}
                      >
                        {isAtivo ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span className="capitalize">{client.status}</span>
                      </span>
                    </div>

                    <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5 font-mono truncate">
                      <Database className="w-3.5 h-3.5 shrink-0" />
                      <span>Projeto: {client.firebaseConfig.projectId}</span>
                    </div>
                  </div>

                    {/* Resumo ao Vivo (Métricas do Firebase daquele Cliente) */}
                  <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-on-surface">Resumo de Dados</span>
                      <button
                        onClick={() => fetchClientStats(client)}
                        disabled={isLoadingStats}
                        className="text-[11px] text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingStats ? 'animate-spin' : ''}`} />
                        <span>{stats ? 'Atualizar' : 'Consultar'}</span>
                      </button>
                    </div>

                    {stats ? (
                      stats.status === 'ok' ? (
                        <>
                          <div className="grid grid-cols-3 gap-2 text-center pt-1">
                            <div className="bg-surface-container-low rounded-lg p-2">
                              <Users className="w-3.5 h-3.5 text-primary mx-auto mb-0.5" />
                              <div className="text-sm font-bold font-display">{stats.eleitoresCount}</div>
                              <span className="text-[10px] text-on-surface-variant">Eleitores</span>
                            </div>
                            <div className="bg-surface-container-low rounded-lg p-2">
                              <Award className="w-3.5 h-3.5 text-secondary mx-auto mb-0.5" />
                              <div className="text-sm font-bold font-display">{stats.liderancasCount}</div>
                              <span className="text-[10px] text-on-surface-variant">Lideranças</span>
                            </div>
                            <div className="bg-surface-container-low rounded-lg p-2">
                              <MapPin className="w-3.5 h-3.5 text-tertiary mx-auto mb-0.5" />
                              <div className="text-sm font-bold font-display">{stats.locaisCount}</div>
                              <span className="text-[10px] text-on-surface-variant">Locais</span>
                            </div>
                          </div>
                          {stats.eleitoresCount === 0 && stats.liderancasCount === 0 && (
                            <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-outline-variant/20">
                              <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                Banco ainda não provisionado
                              </span>
                              <button
                                onClick={() => openBootstrapModal(client)}
                                className="text-[10px] text-primary hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Wand2 className="w-2.5 h-2.5" />
                                <span>Inicializar</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-2 rounded-lg bg-error/10 text-error text-[11px] space-y-1">
                          <div className="font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Erro de conexão</span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant truncate">{stats.errorMessage}</p>
                        </div>
                      )
                    ) : (
                      <p className="text-[11px] text-on-surface-variant italic">
                        Clique em &quot;Consultar&quot; para conectar ao Firebase do cliente e obter contagens.
                      </p>
                    )}
                  </div>

                  {/* Ações do Card */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/30 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditClientModal(client)}
                        title="Editar configurações deste cliente"
                        className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openBootstrapModal(client)}
                        title="Inicializar / Provisionar banco deste cliente (Admin & Configurações)"
                        className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportBackup(client)}
                        disabled={exportingSubdomain === client.subdominio}
                        title="Exportar Backup consolidado do cliente (JSON)"
                        className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {exportingSubdomain === client.subdominio ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => openRestoreModal(client)}
                        title="Restaurar Backup do cliente (Disaster Recovery / JSON)"
                        className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleClientStatus(client)}
                        title={isAtivo ? 'Desativar este cliente' : 'Ativar este cliente'}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isAtivo
                            ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client)}
                        title="Remover cliente"
                        className="p-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={enteringClientSubdomain === client.subdominio}
                        onClick={() => handleAccessInCurrentTab(client)}
                        title={`Conectar ao banco de dados e entrar no painel de ${client.nome} (${client.firebaseConfig?.projectId || client.subdominio})`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                      >
                        {enteringClientSubdomain === client.subdominio ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Conectando...</span>
                          </>
                        ) : (
                          <>
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Entrar no Painel</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`https://${client.subdominio}.adti.app.br`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir ${client.subdominio}.adti.app.br em nova aba`}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}

        {/* VISÃO DE AUDITORIA CENTRAL (PARTE 8) */}
        {activeMasterTab === 'auditoria' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Cabeçalho e Filtros da Auditoria */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold font-display text-on-surface">
                    Trilha Global de Auditoria
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Registro de ações administrativas em todos os clientes e bancos Firebase
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  disabled={isLoadingAuditLogs}
                  className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAuditLogs ? 'animate-spin' : ''}`} />
                  <span>Atualizar Logs</span>
                </button>
              </div>
            </div>

            {/* Filtros de Auditoria */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-container-low border border-outline-variant/50 rounded-2xl p-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  placeholder="Filtrar por subdomínio, autor ou detalhes..."
                  className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                {(['todos', 'criacao', 'edicao', 'status_alterado', 'bootstrap', 'backup_exportado', 'backup_restaurado', 'exclusao'] as const).map((ac) => (
                  <button
                    key={ac}
                    onClick={() => setAuditActionFilter(ac)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      auditActionFilter === ac
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                    }`}
                  >
                    {ac === 'todos' ? 'Todos' :
                     ac === 'criacao' ? 'Criação' :
                     ac === 'edicao' ? 'Edição' :
                     ac === 'status_alterado' ? 'Status' :
                     ac === 'bootstrap' ? 'Bootstrap' :
                     ac === 'backup_exportado' ? 'Exportação' :
                     ac === 'backup_restaurado' ? 'Restauração' :
                     'Exclusão'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabela de Auditoria */}
            <div className="bg-surface-container-low border border-outline-variant/50 rounded-2xl overflow-hidden shadow-xs">
              {isLoadingAuditLogs ? (
                <div className="py-12 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 text-primary animate-spin mx-auto" />
                  <p className="text-xs text-on-surface-variant">Carregando eventos de auditoria...</p>
                </div>
              ) : filteredAuditLogs.length === 0 ? (
                <div className="py-12 text-center space-y-2 text-on-surface-variant text-xs">
                  <FileText className="w-8 h-8 mx-auto opacity-40" />
                  <p>Nenhum evento registrado com os filtros aplicados.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant/40 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        <th className="py-2.5 px-4">Data / Hora</th>
                        <th className="py-2.5 px-4">Cliente / Subdomínio</th>
                        <th className="py-2.5 px-4">Ação</th>
                        <th className="py-2.5 px-4">Autor</th>
                        <th className="py-2.5 px-4">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {filteredAuditLogs.map((log) => {
                        const dateDisplay = (() => {
                          const ts = log.timestamp;
                          if (!ts) return 'Agora';
                          if (ts?.toDate && typeof ts.toDate === 'function') {
                            return ts.toDate().toLocaleString('pt-BR');
                          }
                          if (typeof ts === 'string' || typeof ts === 'number') {
                            const d = new Date(ts);
                            if (!isNaN(d.getTime())) return d.toLocaleString('pt-BR');
                          }
                          if (ts?.seconds) {
                            return new Date(ts.seconds * 1000).toLocaleString('pt-BR');
                          }
                          return 'Agora';
                        })();

                        return (
                          <tr key={log.id} className="hover:bg-surface-container-high/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                              {dateDisplay}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-bold text-on-surface">{log.tenantNome}</span>
                              <span className="block text-[10px] text-on-surface-variant font-mono">
                                {log.tenantSubdominio}.adti.app.br
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                  log.acao === 'backup_restaurado'
                                    ? 'bg-purple-500/15 text-purple-700 border border-purple-500/30'
                                    : log.acao === 'bootstrap'
                                    ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                                    : log.acao === 'backup_exportado'
                                    ? 'bg-blue-500/15 text-blue-700 border border-blue-500/30'
                                    : log.acao === 'status_alterado'
                                    ? 'bg-amber-500/15 text-amber-700 border border-amber-500/30'
                                    : log.acao === 'exclusao'
                                    ? 'bg-rose-500/15 text-rose-700 border border-rose-500/30'
                                    : 'bg-primary/10 text-primary border border-primary/20'
                                }`}
                              >
                                {log.acao}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                              {log.autorEmail}
                            </td>
                            <td className="py-3 px-4 text-xs text-on-surface">
                              {log.detalhes}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISÃO DE DIAGNÓSTICO DE SAÚDE (PARTE 8) */}
        {activeMasterTab === 'saude' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Header de Saúde */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-container-low border border-outline-variant/50 rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold font-display text-on-surface">
                    Diagnóstico de Conectividade & Latência do Firestore
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Teste em tempo real de latência de leitura e status do banco de dados de cada cliente
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckAllHealth}
                disabled={isCheckingAllHealth}
                className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-all inline-flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingAllHealth ? 'animate-spin' : ''}`} />
                <span>{isCheckingAllHealth ? 'Testando Bancos...' : 'Testar Todos os Bancos Agora'}</span>
              </button>
            </div>

            {/* Grid de Diagnósticos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {clients.map((c) => {
                const health = healthResults[c.subdominio];
                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/50 space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-xs text-on-surface truncate">{c.nome}</h4>
                        <span className="text-[10px] text-on-surface-variant font-mono block">
                          {c.subdominio}.adti.app.br
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'ativo' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-on-surface-variant">Project ID:</span>
                        <span className="font-mono font-semibold truncate max-w-[150px]">{c.firebaseConfig.projectId}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-on-surface-variant">Database:</span>
                        <span className="font-mono">{c.firebaseConfig.firestoreDatabaseId || '(default)'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {health ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          {health.success ? (
                            <>
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                              <span className="text-emerald-700">Online ({health.latencyMs}ms)</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                              <span className="text-rose-600">Falha de Conexão</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-on-surface-variant italic">
                          Aguardando teste
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          const res = await testTenantConnectionWithLatency(c.firebaseConfig);
                          setHealthResults((prev) => ({ ...prev, [c.subdominio]: res }));
                        }}
                        className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
                      >
                        Testar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE PROVISIONAMENTO / BOOTSTRAP DE BANCO DO CLIENTE (PARTE 4) */}
      {isBootstrapModalOpen && bootstrapTargetClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-xl w-full bg-surface-container-low border border-outline-variant rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-on-surface">
                    Provisionar Banco do Cliente
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    {bootstrapTargetClient.nome} ({bootstrapTargetClient.subdominio}.adti.app.br)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBootstrapModalOpen(false)}
                className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Tela de Resultado de Sucesso */}
            {bootstrapResult ? (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-700">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Banco do cliente provisionado com sucesso!</span>
                  </div>
                  <p className="text-xs text-emerald-900/80 leading-relaxed">
                    {bootstrapResult.message}
                  </p>
                  {bootstrapResult.collectionsCreated && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {bootstrapResult.collectionsCreated.map((col) => (
                        <span
                          key={col}
                          className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold"
                        >
                          +{col}
                        </span>
                      ))}
                      {bootstrapResult.locaisImportados ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold">
                          {bootstrapResult.locaisImportados} locais importados
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Box de Credenciais para Envio */}
                <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-primary" />
                      Credenciais Padrão Criadas (Admin + Operador)
                    </span>
                    <button
                      onClick={copyBootstrapCredentials}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedCredentials ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar para WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-3 text-xs font-mono bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40">
                    <div>
                      <span className="text-on-surface-variant">Painel: </span>
                      <a
                        href={`https://${bootstrapTargetClient.subdominio}.adti.app.br/login`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-semibold"
                      >
                        https://{bootstrapTargetClient.subdominio}.adti.app.br/login
                      </a>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 space-y-1">
                      <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        <span>1. Perfil Administrador</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">E-mail: </span>
                        <strong className="text-on-surface">{bootstrapResult.adminEmail}</strong>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">Senha Provisória: </span>
                        <strong className="text-primary">{bootstrapResult.adminSenha}</strong>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 space-y-1">
                      <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>2. Perfil Operador</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">E-mail: </span>
                        <strong className="text-on-surface">{bootstrapResult.operadorEmail || `operador@${bootstrapTargetClient.subdominio}.adti.app.br`}</strong>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">Senha Provisória: </span>
                        <strong className="text-primary">{bootstrapResult.operadorSenha || '123456'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsBootstrapModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            ) : (
              /* Formulário de Configuração do Bootstrap */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-on-surface-variant leading-relaxed flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Esta ação criará a coleção de <strong>configurações</strong> da campanha, o primeiro{' '}
                    <strong>usuário Administrador</strong> e opcionalmente o <strong>catálogo de locais de votação</strong> no
                    Firebase do cliente.
                  </span>
                </div>

                {bootstrapError && (
                  <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{bootstrapError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Nome do Administrador Inicial *
                    </label>
                    <input
                      type="text"
                      required
                      value={bootstrapAdminNome}
                      onChange={(e) => setBootstrapAdminNome(e.target.value)}
                      placeholder="Ex: Administrador Geral"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                        E-mail de Login do Administrador *
                      </label>
                      <input
                        type="email"
                        required
                        value={bootstrapAdminEmail}
                        onChange={(e) => setBootstrapAdminEmail(e.target.value)}
                        placeholder="admin@campanha.com.br"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-on-surface-variant">
                          Senha Provisória Admin *
                        </label>
                        <button
                          type="button"
                          onClick={() => setBootstrapAdminSenha(generateRandomPassword())}
                          className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                        >
                          Gerar Nova
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={bootstrapAdminSenha}
                        onChange={(e) => setBootstrapAdminSenha(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                        E-mail de Login do Operador *
                      </label>
                      <input
                        type="email"
                        required
                        value={bootstrapOperadorEmail}
                        onChange={(e) => setBootstrapOperadorEmail(e.target.value)}
                        placeholder="operador@campanha.com.br"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                        Senha Provisória Operador *
                      </label>
                      <input
                        type="text"
                        required
                        value={bootstrapOperadorSenha}
                        onChange={(e) => setBootstrapOperadorSenha(e.target.value)}
                        placeholder="123456"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                        Meta de Votos da Campanha
                      </label>
                      <input
                        type="number"
                        min="100"
                        value={bootstrapMetaVotos}
                        onChange={(e) => setBootstrapMetaVotos(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={bootstrapImportarLocais}
                          onChange={(e) => setBootstrapImportarLocais(e.target.checked)}
                          className="w-4 h-4 rounded text-primary focus:ring-primary/30 border-outline-variant cursor-pointer"
                        />
                        <span className="text-xs font-medium text-on-surface">
                          Importar catálogo de locais (Teresina - PI)
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setIsBootstrapModalOpen(false)}
                    disabled={isBootstrapping}
                    className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBootstrap}
                    disabled={isBootstrapping}
                    className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isBootstrapping ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Provisionando Banco...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        <span>Executar Provisionamento</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE RESTAURAÇÃO DE BACKUP / DISASTER RECOVERY (PARTE 8) */}
      {isRestoreModalOpen && restoreTargetClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-xl w-full bg-surface-container-low border border-outline-variant rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-on-surface">
                    Restaurar Backup do Cliente
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    {restoreTargetClient.nome} ({restoreTargetClient.subdominio}.adti.app.br)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRestoreModalOpen(false)}
                className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {restoreResult ? (
              /* Resultado de Sucesso */
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-700">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Backup restaurado com sucesso!</span>
                  </div>
                  <p className="text-xs text-emerald-900/80 leading-relaxed">
                    {restoreResult.message}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold">
                      {restoreResult.eleitoresRestaurados} eleitores
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold">
                      {restoreResult.liderancasRestauradas} lideranças
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold">
                      {restoreResult.locaisRestaurados} locais
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 text-[10px] font-mono font-bold">
                      {restoreResult.usuariosRestaurados} usuários
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsRestoreModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              /* Formulário / Upload */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-on-surface-variant leading-relaxed flex items-start gap-2.5">
                  <RotateCcw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Selecione um arquivo de backup exportado anteriormente no formato <strong>.json</strong>.
                    Os dados serão gravados em lotes atômicos no Firestore do cliente selecionado.
                  </span>
                </div>

                {restoreError && (
                  <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{restoreError}</span>
                  </div>
                )}

                {/* Upload Input */}
                <div className="border-2 border-dashed border-outline-variant/70 rounded-2xl p-5 text-center space-y-2 hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-primary mx-auto opacity-70" />
                  <div>
                    <label className="text-xs font-bold text-primary hover:underline cursor-pointer">
                      <span>Clique para escolher o arquivo de backup (.json)</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleRestoreFileSelected(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-on-surface-variant mt-0.5 font-mono">
                      {restoreFileName ? restoreFileName : 'Ex: backup_clientea_2026-09-28.json'}
                    </p>
                  </div>
                </div>

                {isReadingRestoreFile && (
                  <div className="flex items-center justify-center gap-2 text-xs text-primary py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Lendo e validando estrutura do arquivo JSON...</span>
                  </div>
                )}

                {/* Preview dos Dados Contidos no Backup */}
                {restoreBackupData && (
                  <div className="space-y-3 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/60 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                      <span className="text-xs font-bold text-on-surface">Resumo do Arquivo de Backup:</span>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {restoreBackupData.metadata?.exportedAt ? new Date(restoreBackupData.metadata.exportedAt).toLocaleString('pt-BR') : 'Data n/d'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 rounded-xl bg-surface-container-low border border-outline-variant/40">
                        <div className="text-sm font-bold text-primary">{restoreBackupData.eleitores?.length || 0}</div>
                        <span className="text-[10px] text-on-surface-variant">Eleitores</span>
                      </div>
                      <div className="p-2 rounded-xl bg-surface-container-low border border-outline-variant/40">
                        <div className="text-sm font-bold text-secondary">{restoreBackupData.liderancas?.length || 0}</div>
                        <span className="text-[10px] text-on-surface-variant">Lideranças</span>
                      </div>
                      <div className="p-2 rounded-xl bg-surface-container-low border border-outline-variant/40">
                        <div className="text-sm font-bold text-tertiary">{restoreBackupData.locais_votacao?.length || 0}</div>
                        <span className="text-[10px] text-on-surface-variant">Locais</span>
                      </div>
                      <div className="p-2 rounded-xl bg-surface-container-low border border-outline-variant/40">
                        <div className="text-sm font-bold text-on-surface">{restoreBackupData.usuarios?.length || 0}</div>
                        <span className="text-[10px] text-on-surface-variant">Usuários</span>
                      </div>
                    </div>

                    {/* Opções de Seleção do que Restaurar */}
                    <div className="pt-2 border-t border-outline-variant/30 space-y-1.5 text-xs">
                      <span className="font-semibold text-on-surface block mb-1">Selecione o que deseja restaurar:</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restoreOptions.restoreEleitores}
                          onChange={(e) => setRestoreOptions({ ...restoreOptions, restoreEleitores: e.target.checked })}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/20 cursor-pointer"
                        />
                        <span>Restaurar Eleitores ({restoreBackupData.eleitores?.length || 0})</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restoreOptions.restoreLiderancas}
                          onChange={(e) => setRestoreOptions({ ...restoreOptions, restoreLiderancas: e.target.checked })}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/20 cursor-pointer"
                        />
                        <span>Restaurar Lideranças ({restoreBackupData.liderancas?.length || 0})</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restoreOptions.restoreLocais}
                          onChange={(e) => setRestoreOptions({ ...restoreOptions, restoreLocais: e.target.checked })}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/20 cursor-pointer"
                        />
                        <span>Restaurar Locais de Votação ({restoreBackupData.locais_votacao?.length || 0})</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restoreOptions.restoreConfiguracoes}
                          onChange={(e) => setRestoreOptions({ ...restoreOptions, restoreConfiguracoes: e.target.checked })}
                          className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/20 cursor-pointer"
                        />
                        <span>Restaurar Parâmetros da Campanha</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setIsRestoreModalOpen(false)}
                    disabled={isRestoring}
                    className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={!restoreBackupData || isRestoring}
                    className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Restaurando em Lote...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Iniciar Restauração</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO E EDIÇÃO DE CLIENTE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full bg-surface-container-low border border-outline-variant rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-4">
              <div>
                <h2 className="text-xl font-bold font-display text-on-surface">
                  {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Configuração de subdomínio e apontamento para projeto Firebase isolado
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="space-y-5">
              {/* Seção 1: Dados do Cliente */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  <span>1. Identificação do Cliente</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Nome da Campanha / Organização *
                    </label>
                    <input
                      type="text"
                      required
                      value={formNome}
                      onChange={(e) => setFormNome(e.target.value)}
                      placeholder="Ex: Campanha Dr. Carlos 2026"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Subdomínio *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        disabled={!!editingClient}
                        value={formSubdominio}
                        onChange={(e) => setFormSubdominio(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="ex: drcarlos"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                      />
                    </div>
                    <span className="block text-[10px] text-on-surface-variant mt-1 font-mono">
                      URL: https://{formSubdominio || 'subdominio'}.adti.app.br
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Status do Acesso
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={formStatus === 'ativo'}
                        onChange={() => setFormStatus('ativo')}
                        className="accent-primary"
                      />
                      <span className="text-emerald-600 font-semibold">Ativo (Acesso Liberado)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={formStatus === 'inativo'}
                        onChange={() => setFormStatus('inativo')}
                        className="accent-primary"
                      />
                      <span className="text-amber-600 font-semibold">Inativo (Acesso Pausado)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Seção 2: Importação Rápida via JSON */}
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                    <ClipboardPaste className="w-4 h-4 text-primary" />
                    <span>Importação Rápida via JSON do Console do Firebase</span>
                  </div>
                  {jsonPaste && (
                    <button
                      type="button"
                      onClick={handleParseJsonPaste}
                      className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      Preencher Campos
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={jsonPaste}
                  onChange={(e) => setJsonPaste(e.target.value)}
                  placeholder="Cole aqui o objeto const firebaseConfig = { ... } copiado do Firebase Console para preencher tudo automaticamente"
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Seção 3: Credenciais do Firebase */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Database className="w-4 h-4" />
                  <span>2. Configuração do Firebase do Cliente</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Project ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFirebase.projectId}
                      onChange={(e) =>
                        setFormFirebase({
                          ...formFirebase,
                          projectId: e.target.value,
                          authDomain: `${e.target.value}.firebaseapp.com`,
                          storageBucket: `${e.target.value}.firebasestorage.app`
                        })
                      }
                      placeholder="ex: campanha-drcarlos-2026"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Web API Key (apiKey) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFirebase.apiKey}
                      onChange={(e) => setFormFirebase({ ...formFirebase, apiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      App ID (appId) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFirebase.appId}
                      onChange={(e) => setFormFirebase({ ...formFirebase, appId: e.target.value })}
                      placeholder="1:123456789:web:abcdef"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Auth Domain
                    </label>
                    <input
                      type="text"
                      value={formFirebase.authDomain}
                      onChange={(e) => setFormFirebase({ ...formFirebase, authDomain: e.target.value })}
                      placeholder="projeto.firebaseapp.com"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Firestore Database ID
                    </label>
                    <input
                      type="text"
                      value={formFirebase.firestoreDatabaseId || '(default)'}
                      onChange={(e) => setFormFirebase({ ...formFirebase, firestoreDatabaseId: e.target.value })}
                      placeholder="(default)"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                      Storage Bucket
                    </label>
                    <input
                      type="text"
                      value={formFirebase.storageBucket || ''}
                      onChange={(e) => setFormFirebase({ ...formFirebase, storageBucket: e.target.value })}
                      placeholder="projeto.firebasestorage.app"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Testar Conexão Firebase</span>
                  </button>

                  {testConnectionStatus && (
                    <div
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        testConnectionStatus.success ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {testConnectionStatus.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      <span>{testConnectionStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingClient ? 'Salvar Alterações' : 'Cadastrar Cliente'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
