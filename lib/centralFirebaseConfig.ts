import { TenantFirebaseConfig } from './tenantTypes';
import appletConfig from '../firebase-applet-config.json';

// Configuração do projeto central do Firebase (onde reside a coleção clientes_registry e o Admin Master)
export const CENTRAL_FIREBASE_CONFIG: TenantFirebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_CENTRAL_PROJECT_ID || appletConfig.projectId,
  appId: process.env.NEXT_PUBLIC_CENTRAL_APP_ID || appletConfig.appId,
  apiKey: process.env.NEXT_PUBLIC_CENTRAL_API_KEY || appletConfig.apiKey,
  authDomain: process.env.NEXT_PUBLIC_CENTRAL_AUTH_DOMAIN || appletConfig.authDomain,
  firestoreDatabaseId: process.env.NEXT_PUBLIC_CENTRAL_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)',
  storageBucket: process.env.NEXT_PUBLIC_CENTRAL_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_CENTRAL_MESSAGING_SENDER_ID || appletConfig.messagingSenderId
};
