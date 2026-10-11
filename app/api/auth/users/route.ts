import { NextRequest, NextResponse } from 'next/server';
import { queryFirestoreRest } from '@/lib/firestoreRest';
import { getAllUsersFromFile, DEFAULT_SYSTEM_USERS } from '@/lib/userFileRegistry';
import { getTenantFromFile } from '@/lib/tenantFileRegistry';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subdomain = searchParams.get('subdomain') || 'demo';
    const cleanSub = subdomain.trim().toLowerCase();

    let clientConfig: any = undefined;
    if (cleanSub && cleanSub !== 'admin' && cleanSub !== 'demo' && cleanSub !== 'preview') {
      const fileClient = getTenantFromFile(cleanSub);
      if (fileClient && fileClient.firebaseConfig?.projectId) {
        clientConfig = fileClient.firebaseConfig;
      }
    }

    const effectiveConfig = clientConfig || CENTRAL_FIREBASE_CONFIG;

    let users: any[] = [];
    try {
      users = await queryFirestoreRest('usuarios', undefined, 100, effectiveConfig);
    } catch {}

    const fileUsers = getAllUsersFromFile();

    // Mescla usuários do banco e do arquivo local garantindo unicidade por e-mail
    const userMap = new Map<string, any>();
    for (const u of DEFAULT_SYSTEM_USERS) {
      userMap.set((u.email || '').toLowerCase().trim(), u);
    }
    for (const u of fileUsers) {
      userMap.set((u.email || '').toLowerCase().trim(), u);
    }
    for (const u of users) {
      userMap.set((u.email || '').toLowerCase().trim(), u);
    }

    const mergedUsers = Array.from(userMap.values()).map((u) => {
      const { senha: _senha, ...safeUser } = u;
      return safeUser;
    });

    return NextResponse.json({
      success: true,
      users: mergedUsers
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({
      success: true,
      users: DEFAULT_SYSTEM_USERS.map(({ senha: _senha, ...safeUser }) => safeUser)
    }, { headers: NO_CACHE_HEADERS });
  }
}
