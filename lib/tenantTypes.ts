export interface TenantFirebaseConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  appId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export type TenantStatus = 'ativo' | 'inativo';

export interface TenantClient {
  id: string; // Document ID (geralmente igual ao subdomínio)
  subdominio: string; // Ex: "clientea"
  nome: string; // Ex: "Campanha Dr. Carlos"
  status: TenantStatus;
  firebaseConfig: TenantFirebaseConfig;
  criadoEm?: any;
  atualizadoEm?: any;
}

export interface TenantStats {
  eleitoresCount: number;
  liderancasCount: number;
  locaisCount: number;
  lastChecked?: string;
  status: 'ok' | 'error' | 'loading';
  errorMessage?: string;
}

export interface TenantBootstrapOptions {
  tenantId: string;
  subdominio: string;
  nomeCampanha: string;
  adminNome: string;
  adminEmail: string;
  adminSenha: string;
  metaVotos?: number;
  cargo?: string;
  anoEleicao?: string;
  municipio?: string;
  uf?: string;
  importarLocais?: boolean;
}

export interface TenantBootstrapResult {
  success: boolean;
  message: string;
  adminEmail?: string;
  adminSenha?: string;
  loginUrl?: string;
  collectionsCreated?: string[];
  locaisImportados?: number;
  error?: string;
}

export interface TenantBackupData {
  metadata: {
    tenantId: string;
    subdominio: string;
    nomeCampanha: string;
    projectId: string;
    exportedAt: string;
    totalEleitores: number;
    totalLiderancas: number;
    totalLocais: number;
    totalUsuarios: number;
  };
  configuracoes?: any;
  eleitores?: any[];
  liderancas?: any[];
  locais_votacao?: any[];
  usuarios?: any[];
}
