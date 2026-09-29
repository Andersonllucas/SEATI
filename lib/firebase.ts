import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  getCountFromServer,
  collection,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  addDoc,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { getAuth, Auth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { CENTRAL_FIREBASE_CONFIG } from './centralFirebaseConfig';
import {
  TenantFirebaseConfig,
  TenantStats,
  TenantClient,
  TenantBootstrapOptions,
  TenantBootstrapResult,
  TenantBackupData,
  TenantRestoreOptions,
  TenantRestoreResult,
  TenantAuditLog
} from './tenantTypes';
import { resetCircuitBreaker } from './firestoreErrors';
import { hashPassword } from './crypto';
import { LOCAIS_TERESINA_PI } from './locaisCatalog';

interface FirebaseBundle {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  config: TenantFirebaseConfig;
}

// Cache de instâncias do Firebase por chave (subdomínio ou id de projeto)
const appsCache = new Map<string, FirebaseBundle>();

// Instância ativa global para resolução dinâmica
let currentActiveTenantSubdomain: string | null = null;
let currentActiveBundle: FirebaseBundle | null = null;

/**
 * Cria ou recupera uma instância do Firebase baseada em configuração dinâmica
 */
export function getOrCreateFirebaseBundle(key: string, config: TenantFirebaseConfig): FirebaseBundle {
  const normalizedKey = key.trim().toLowerCase();
  
  if (appsCache.has(normalizedKey)) {
    return appsCache.get(normalizedKey)!;
  }

  // Se o tenant apontar para o mesmo projeto e banco do Firebase Central,
  // reutiliza o bundle 'central' para evitar conexões gRPC duplicadas e streams conflitantes
  if (normalizedKey !== 'central') {
    const isSameAsCentral =
      config.projectId === CENTRAL_FIREBASE_CONFIG.projectId &&
      (config.firestoreDatabaseId || '(default)') === (CENTRAL_FIREBASE_CONFIG.firestoreDatabaseId || '(default)');
    if (isSameAsCentral) {
      const central = getCentralBundle();
      appsCache.set(normalizedKey, central);
      return central;
    }
  }

  // Define nome do app do Firebase (usa o padrão [DEFAULT] para o central)
  const appName = normalizedKey === 'central' ? '[DEFAULT]' : `tenant_${normalizedKey}`;
  const existingApp = getApps().find((a) => a.name === appName);
  
  const app = existingApp || initializeApp(
    {
      projectId: config.projectId,
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      appId: config.appId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId
    },
    appName === '[DEFAULT]' ? undefined : appName
  );

  let db: Firestore;
  const targetDbId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
    ? config.firestoreDatabaseId
    : undefined;

  try {
    if (typeof window !== 'undefined') {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      }, targetDbId);
    } else {
      db = targetDbId ? getFirestore(app, targetDbId) : getFirestore(app);
    }
  } catch {
    // Se a instância já tiver sido inicializada, reaproveita getFirestore
    db = targetDbId ? getFirestore(app, targetDbId) : getFirestore(app);
  }

  const auth: Auth = getAuth(app);
  if (typeof window !== 'undefined') {
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.warn('[Firebase] Aviso ao definir browserSessionPersistence:', err);
    });
  }

  const bundle: FirebaseBundle = { app, db, auth, config };
  appsCache.set(normalizedKey, bundle);
  return bundle;
}

/**
 * Retorna a instância do Firebase Central (usado para clientes_registry e Admin Master)
 */
export function getCentralBundle(): FirebaseBundle {
  return getOrCreateFirebaseBundle('central', CENTRAL_FIREBASE_CONFIG);
}

export function getCentralDb(): Firestore {
  return getCentralBundle().db;
}

export function getCentralApp(): FirebaseApp {
  return getCentralBundle().app;
}

export function getCentralAuth(): Auth {
  return getCentralBundle().auth;
}

type TenantChangeListener = (bundle: FirebaseBundle, subdomain: string) => void;
const tenantChangeListeners = new Set<TenantChangeListener>();

/**
 * Registra um callback para ser notificado sempre que o tenant ativo for alterado
 */
export function subscribeActiveTenant(listener: TenantChangeListener): () => void {
  tenantChangeListeners.add(listener);
  if (currentActiveBundle && currentActiveTenantSubdomain) {
    try {
      listener(currentActiveBundle, currentActiveTenantSubdomain);
    } catch (e) {
      console.error('Erro ao executar subscriber de tenant:', e);
    }
  }
  return () => {
    tenantChangeListeners.delete(listener);
  };
}

/**
 * Inicializa ou ativa a configuração do Firebase para um subdomínio de cliente específico
 */
export function setActiveTenant(subdomain: string, config: TenantFirebaseConfig): FirebaseBundle {
  const normalizedSubdomain = subdomain.trim().toLowerCase();
  const bundle = getOrCreateFirebaseBundle(normalizedSubdomain, config);
  currentActiveTenantSubdomain = normalizedSubdomain;
  currentActiveBundle = bundle;

  // Limpa circuit breakers anteriores para dar ao novo tenant uma tentativa limpa
  resetCircuitBreaker(undefined, normalizedSubdomain);

  // Notifica todos os listeners registrados
  tenantChangeListeners.forEach((listener) => {
    try {
      listener(bundle, normalizedSubdomain);
    } catch (err) {
      console.error('Erro ao notificar listener de troca de tenant:', err);
    }
  });

  return bundle;
}

/**
 * Retorna o FirebaseBundle para um determinado tenant (sem necessariamente torná-lo ativo global)
 */
export function getTenantFirebase(subdomain: string, config: TenantFirebaseConfig): FirebaseBundle {
  return getOrCreateFirebaseBundle(subdomain, config);
}

/**
 * Retorna a instância ativa do banco de dados (tenant ativo ou fallback central)
 */
export function getActiveDb(): Firestore {
  if (currentActiveBundle) {
    return currentActiveBundle.db;
  }
  return getCentralBundle().db;
}

/**
 * Retorna o App ativo
 */
export function getActiveApp(): FirebaseApp {
  if (currentActiveBundle) {
    return currentActiveBundle.app;
  }
  return getCentralBundle().app;
}

/**
 * Retorna o Auth ativo
 */
export function getActiveAuth(): Auth {
  if (currentActiveBundle) {
    return currentActiveBundle.auth;
  }
  return getCentralBundle().auth;
}

export function getActiveSubdomain(): string | null {
  return currentActiveTenantSubdomain;
}

/**
 * Consulta de métricas ao vivo no Firebase de um cliente específico (Parte 3)
 */
export async function getTenantClientStats(config: TenantFirebaseConfig): Promise<TenantStats> {
  try {
    const tempKey = `stats_${config.projectId}_${config.firestoreDatabaseId || 'default'}`;
    const bundle = getOrCreateFirebaseBundle(tempKey, config);
    const targetDb = bundle.db;

    // Realiza contagens atômicas via getCountFromServer
    const [eleitoresSnap, liderancasSnap, locaisSnap] = await Promise.all([
      getCountFromServer(collection(targetDb, 'eleitores')).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(collection(targetDb, 'liderancas')).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(collection(targetDb, 'locais_votacao')).catch(() => ({ data: () => ({ count: 0 }) }))
    ]);

    return {
      eleitoresCount: eleitoresSnap.data().count,
      liderancasCount: liderancasSnap.data().count,
      locaisCount: locaisSnap.data().count,
      lastChecked: new Date().toISOString(),
      status: 'ok'
    };
  } catch (error: any) {
    console.error('Erro ao consultar métricas do tenant:', error);
    return {
      eleitoresCount: 0,
      liderancasCount: 0,
      locaisCount: 0,
      lastChecked: new Date().toISOString(),
      status: 'error',
      errorMessage: error?.message || 'Falha ao conectar ao banco do cliente'
    };
  }
}

/**
 * Inicialização e provisionamento do banco de dados de um novo cliente (Parte 4)
 * Cria estrutura inicial: configuracoes, usuario administrador inicial e catálogo opcional de locais.
 */
export async function bootstrapTenantDatabase(
  config: TenantFirebaseConfig,
  options: TenantBootstrapOptions
): Promise<TenantBootstrapResult> {
  try {
    const tempKey = `bootstrap_${options.subdominio}_${config.projectId}`;
    const bundle = getOrCreateFirebaseBundle(tempKey, config);
    const targetDb = bundle.db;

    const collectionsCreated: string[] = [];

    // 1. Cria ou atualiza a coleção de configuracoes (documento geral)
    const configRef = doc(targetDb, 'configuracoes', 'geral');
    await setDoc(
      configRef,
      {
        nomeCampanha: options.nomeCampanha.trim(),
        cargo: options.cargo || 'Prefeito / Vereador / Deputado',
        anoEleicao: options.anoEleicao || '2026',
        metaVotos: Number(options.metaVotos) || 5000,
        municipio: options.municipio || 'Teresina',
        uf: options.uf || 'PI',
        subdominio: options.subdominio.trim().toLowerCase(),
        dataCriacao: new Date().toISOString(),
        atualizadoEm: serverTimestamp()
      },
      { merge: true }
    );
    collectionsCreated.push('configuracoes');

    // 2. Cria os usuários padrão: Administrador e Operador da base
    const cleanAdminEmail = options.adminEmail.trim().toLowerCase();
    const adminDocId = cleanAdminEmail.replace(/[^a-z0-9_]/g, '_');
    const adminRef = doc(targetDb, 'usuarios', adminDocId);
    const adminPasswordHash = await hashPassword(options.adminSenha);

    await setDoc(
      adminRef,
      {
        id: adminDocId,
        nome: options.adminNome.trim() || `Administrador ${options.nomeCampanha}`,
        email: cleanAdminEmail,
        senha: adminPasswordHash,
        perfil: 'Administrador',
        status: 'Ativo',
        senhaProvisoria: true,
        criadoEm: new Date().toISOString(),
        atualizadoEm: serverTimestamp()
      },
      { merge: true }
    );

    // Cria o usuário padrão com perfil "Operador"
    const subClean = options.subdominio.trim().toLowerCase();
    const cleanOperadorEmail = (options.operadorEmail || `operador@${subClean}.adti.app.br`).trim().toLowerCase();
    const operadorDocId = cleanOperadorEmail.replace(/[^a-z0-9_]/g, '_');
    const operadorRef = doc(targetDb, 'usuarios', operadorDocId);
    const operadorSenha = options.operadorSenha || '123456';
    const operadorPasswordHash = await hashPassword(operadorSenha);

    await setDoc(
      operadorRef,
      {
        id: operadorDocId,
        nome: options.operadorNome?.trim() || `Operador ${options.nomeCampanha}`,
        email: cleanOperadorEmail,
        senha: operadorPasswordHash,
        perfil: 'Operador',
        status: 'Ativo',
        senhaProvisoria: true,
        criadoEm: new Date().toISOString(),
        atualizadoEm: serverTimestamp()
      },
      { merge: true }
    );
    collectionsCreated.push('usuarios');

    // 3. Importa catálogo de locais de votação se solicitado
    let locaisImportados = 0;
    if (options.importarLocais) {
      const batchSize = 100;
      const locaisToImport = LOCAIS_TERESINA_PI.slice(0, batchSize);

      const batch = writeBatch(targetDb);
      locaisToImport.forEach((local, idx) => {
        const localDocId = `local_${String(idx + 1).padStart(3, '0')}`;
        const localRef = doc(targetDb, 'locais_votacao', localDocId);
        batch.set(localRef, {
          ...local,
          id: localDocId,
          criadoEm: new Date().toISOString()
        });
      });
      await batch.commit();
      collectionsCreated.push('locais_votacao');
      locaisImportados = locaisToImport.length;
    }

    return {
      success: true,
      message: `Banco do cliente "${options.nomeCampanha}" inicializado com sucesso com usuários Administrador e Operador!`,
      adminEmail: cleanAdminEmail,
      adminSenha: options.adminSenha,
      operadorEmail: cleanOperadorEmail,
      operadorSenha: operadorSenha,
      loginUrl: `https://${options.subdominio}.adti.app.br/login`,
      collectionsCreated,
      locaisImportados
    };
  } catch (error: any) {
    console.error('Erro ao inicializar banco do tenant:', error);
    return {
      success: false,
      message: `Falha no provisionamento: ${error?.message || 'Verifique as chaves e regras do Firestore'}`,
      error: error?.message
    };
  }
}

/**
 * Exporta backup consolidado dos dados do tenant em formato JSON estruturado (Parte 4)
 */
export async function exportTenantBackup(
  client: TenantClient
): Promise<TenantBackupData> {
  const tempKey = `backup_${client.subdominio}_${client.firebaseConfig.projectId}`;
  const bundle = getOrCreateFirebaseBundle(tempKey, client.firebaseConfig);
  const targetDb = bundle.db;

  const [eleitoresSnap, liderancasSnap, locaisSnap, usuariosSnap, configSnap] = await Promise.all([
    getDocs(collection(targetDb, 'eleitores')).catch(() => null),
    getDocs(collection(targetDb, 'liderancas')).catch(() => null),
    getDocs(collection(targetDb, 'locais_votacao')).catch(() => null),
    getDocs(collection(targetDb, 'usuarios')).catch(() => null),
    getDocs(collection(targetDb, 'configuracoes')).catch(() => null)
  ]);

  const eleitores = eleitoresSnap ? eleitoresSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const liderancas = liderancasSnap ? liderancasSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const locais_votacao = locaisSnap ? locaisSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const usuarios = usuariosSnap
    ? usuariosSnap.docs.map((d) => {
        const data = d.data();
        const { senha: _senha, ...safeUser } = data as any;
        return { id: d.id, ...safeUser };
      })
    : [];
  const configuracoes = configSnap ? configSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

  return {
    metadata: {
      tenantId: client.id,
      subdominio: client.subdominio,
      nomeCampanha: client.nome,
      projectId: client.firebaseConfig.projectId,
      exportedAt: new Date().toISOString(),
      totalEleitores: eleitores.length,
      totalLiderancas: liderancas.length,
      totalLocais: locais_votacao.length,
      totalUsuarios: usuarios.length
    },
    configuracoes: configuracoes.length > 0 ? configuracoes[0] : null,
    eleitores,
    liderancas,
    locais_votacao,
    usuarios
  };
}

/**
 * Restaura um backup consolidado dos dados do tenant em formato JSON estruturado (Parte 8)
 */
export async function restoreTenantBackup(
  client: TenantClient,
  backup: TenantBackupData,
  options: TenantRestoreOptions = {}
): Promise<TenantRestoreResult> {
  const {
    restoreEleitores = true,
    restoreLiderancas = true,
    restoreLocais = true,
    restoreUsuarios = true,
    restoreConfiguracoes = true
  } = options;

  try {
    const tempKey = `restore_${client.subdominio}_${client.firebaseConfig.projectId}`;
    const bundle = getOrCreateFirebaseBundle(tempKey, client.firebaseConfig);
    const targetDb = bundle.db;

    let eleitoresRestaurados = 0;
    let liderancasRestauradas = 0;
    let locaisRestaurados = 0;
    let usuariosRestaurados = 0;
    let configuracoesRestauradas = false;
    const errors: string[] = [];

    // Helper para comitar em lotes de até 400 operações
    const commitInBatches = async (
      collectionName: string,
      items: any[],
      onItemCount: (c: number) => void
    ) => {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(targetDb);
        for (const item of chunk) {
          const docId = item.id || doc(collection(targetDb, collectionName)).id;
          const { id: _unusedId, ...dataToSave } = item;
          const ref = doc(targetDb, collectionName, docId);
          batch.set(ref, dataToSave, { merge: true });
        }
        await batch.commit();
        onItemCount(chunk.length);
      }
    };

    // 1. Configurações
    if (restoreConfiguracoes && backup.configuracoes) {
      try {
        const { id: _cfgId, ...cfgData } = backup.configuracoes;
        await setDoc(doc(targetDb, 'configuracoes', 'geral'), cfgData, { merge: true });
        configuracoesRestauradas = true;
      } catch (err: any) {
        errors.push(`Erro ao restaurar configurações: ${err?.message}`);
      }
    }

    // 2. Locais de Votação
    if (restoreLocais && Array.isArray(backup.locais_votacao) && backup.locais_votacao.length > 0) {
      try {
        await commitInBatches('locais_votacao', backup.locais_votacao, (count) => {
          locaisRestaurados += count;
        });
      } catch (err: any) {
        errors.push(`Erro ao restaurar locais de votação: ${err?.message}`);
      }
    }

    // 3. Lideranças
    if (restoreLiderancas && Array.isArray(backup.liderancas) && backup.liderancas.length > 0) {
      try {
        await commitInBatches('liderancas', backup.liderancas, (count) => {
          liderancasRestauradas += count;
        });
      } catch (err: any) {
        errors.push(`Erro ao restaurar lideranças: ${err?.message}`);
      }
    }

    // 4. Eleitores
    if (restoreEleitores && Array.isArray(backup.eleitores) && backup.eleitores.length > 0) {
      try {
        await commitInBatches('eleitores', backup.eleitores, (count) => {
          eleitoresRestaurados += count;
        });
      } catch (err: any) {
        errors.push(`Erro ao restaurar eleitores: ${err?.message}`);
      }
    }

    // 5. Usuários
    if (restoreUsuarios && Array.isArray(backup.usuarios) && backup.usuarios.length > 0) {
      try {
        await commitInBatches('usuarios', backup.usuarios, (count) => {
          usuariosRestaurados += count;
        });
      } catch (err: any) {
        errors.push(`Erro ao restaurar usuários: ${err?.message}`);
      }
    }

    return {
      success: errors.length === 0,
      message: `Restauração concluída: ${eleitoresRestaurados} eleitores, ${liderancasRestauradas} lideranças, ${locaisRestaurados} locais e ${usuariosRestaurados} usuários restaurados.`,
      eleitoresRestaurados,
      liderancasRestauradas,
      locaisRestaurados,
      usuariosRestaurados,
      configuracoesRestauradas,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Falha geral na restauração: ${error?.message || 'Verifique as permissões do Firestore'}`,
      eleitoresRestaurados: 0,
      liderancasRestauradas: 0,
      locaisRestaurados: 0,
      usuariosRestaurados: 0,
      configuracoesRestauradas: false,
      errors: [error?.message || 'Erro desconhecido']
    };
  }
}

/**
 * Registra uma ação administrativa no log central de auditoria (Parte 8)
 */
export async function recordCentralAuditLog(
  log: Omit<TenantAuditLog, 'id' | 'timestamp'>
): Promise<void> {
  // 1. Gravação resiliente via API do servidor (Service Account / Firestore REST)
  try {
    if (typeof window !== 'undefined') {
      fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      }).catch((apiErr) => console.warn('Aviso ao enviar auditoria via API:', apiErr));
    }
  } catch (err) {
    console.warn('Falha silenciosa ao acionar rota de auditoria:', err);
  }

  // 2. Gravação direta no Firestore central via SDK do cliente
  try {
    const centralDb = getCentralDb();
    const logsCol = collection(centralDb, 'logs_auditoria');
    await addDoc(logsCol, {
      ...log,
      tipo: 'ADMIN_MASTER',
      entidade: 'Cliente / Tenant',
      data: new Date().toISOString(),
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.warn('Aviso: falha ao gravar log de auditoria central via SDK:', e);
  }
}

/**
 * Consulta os logs de auditoria central dos tenants (Parte 8)
 */
export async function getCentralAuditLogs(limitCount: number = 50): Promise<TenantAuditLog[]> {
  // 1. Tenta carregar via API REST do servidor (rápido, ordenado e sem bloqueios de regras)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/admin/audit?limit=${limitCount}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success && Array.isArray(data.logs)) {
          return data.logs as TenantAuditLog[];
        }
      }
    } catch (apiErr) {
      console.warn('Consulta de auditoria via API falhou, tentando SDK:', apiErr);
    }
  }

  // 2. Fallback via SDK Firestore do cliente
  try {
    const centralDb = getCentralDb();
    const q = query(
      collection(centralDb, 'logs_auditoria'),
      orderBy('data', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
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
  } catch (e) {
    console.warn('Aviso ao consultar logs centrais via SDK:', e);
    return [];
  }
}

/**
 * Testa a conexão e latência com o banco do cliente (Parte 8)
 */
export async function testTenantConnectionWithLatency(
  config: TenantFirebaseConfig
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const tempKey = `test_${config.projectId}_${Date.now()}`;
    const bundle = getOrCreateFirebaseBundle(tempKey, config);
    await getCountFromServer(collection(bundle.db, 'configuracoes'));
    const latency = Date.now() - start;
    return {
      success: true,
      message: `Conectado com sucesso em ${latency}ms!`,
      latencyMs: latency
    };
  } catch (error: any) {
    const latency = Date.now() - start;
    return {
      success: false,
      message: error?.message || 'Falha de conexão com o Firestore do cliente',
      latencyMs: latency
    };
  }
}

