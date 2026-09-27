import { TenantFirebaseConfig } from './tenantTypes';

// Configuração do projeto central do Firebase (onde reside a coleção clientes_registry e o Admin Master)
export const CENTRAL_FIREBASE_CONFIG: TenantFirebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_CENTRAL_PROJECT_ID || 'seati-d0096',
  appId: process.env.NEXT_PUBLIC_CENTRAL_APP_ID || '1:711544625297:web:fc3b015f0fdecbd45e4730',
  apiKey: process.env.NEXT_PUBLIC_CENTRAL_API_KEY || 'AIzaSyChF91tddeI_u7LnayExwg94RP8-n4q2eM',
  authDomain: process.env.NEXT_PUBLIC_CENTRAL_AUTH_DOMAIN || 'seati-d0096.firebaseapp.com',
  firestoreDatabaseId: process.env.NEXT_PUBLIC_CENTRAL_DATABASE_ID || '(default)',
  storageBucket: process.env.NEXT_PUBLIC_CENTRAL_STORAGE_BUCKET || 'seati-d0096.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_CENTRAL_MESSAGING_SENDER_ID || '711544625297'
};
