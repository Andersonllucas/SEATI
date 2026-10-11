import { TenantFirebaseConfig } from './tenantTypes';
import appletConfig from '../firebase-applet-config.json';

// Configuração do projeto central do Firebase (onde reside a coleção clientes_registry e o Admin Master)
// Prioriza variáveis de ambiente (.env / .env.local / produção) para suportar qualquer nova base do Firebase!
const envProjectId =
  process.env.NEXT_PUBLIC_CENTRAL_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID;

const envApiKey =
  process.env.NEXT_PUBLIC_CENTRAL_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY;

const envAuthDomain =
  process.env.NEXT_PUBLIC_CENTRAL_AUTH_DOMAIN ||
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const envAppId =
  process.env.NEXT_PUBLIC_CENTRAL_APP_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

const envDatabaseId =
  process.env.NEXT_PUBLIC_CENTRAL_DATABASE_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
  process.env.FIRESTORE_DATABASE_ID;

const envStorageBucket =
  process.env.NEXT_PUBLIC_CENTRAL_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const envMessagingSenderId =
  process.env.NEXT_PUBLIC_CENTRAL_MESSAGING_SENDER_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

const resolvedProjectId = (envProjectId || appletConfig.projectId || 'seati-d0096').trim();

export const CENTRAL_FIREBASE_CONFIG: TenantFirebaseConfig = {
  projectId: resolvedProjectId,
  appId: (envAppId || appletConfig.appId || '').trim(),
  apiKey: (envApiKey || appletConfig.apiKey || '').trim(),
  authDomain: (envAuthDomain || appletConfig.authDomain || `${resolvedProjectId}.firebaseapp.com`).trim(),
  firestoreDatabaseId: (envDatabaseId || appletConfig.firestoreDatabaseId || '(default)').trim(),
  storageBucket: (envStorageBucket || appletConfig.storageBucket || `${resolvedProjectId}.firebasestorage.app`).trim(),
  messagingSenderId: (envMessagingSenderId || appletConfig.messagingSenderId || '').trim()
};

