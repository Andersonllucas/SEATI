import { NextRequest, NextResponse } from 'next/server';
import { getDocRest, queryFirestoreRest } from '@/lib/firestoreRest';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';
import { TenantClient } from '@/lib/tenantTypes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSubdomain = searchParams.get('subdomain') || 'demo';
    const subdomain = rawSubdomain.trim().toLowerCase();

    let targetConfig = CENTRAL_FIREBASE_CONFIG;

    if (subdomain !== 'demo' && subdomain !== 'preview' && subdomain !== 'central') {
      // Busca dados do tenant
      let clientData: TenantClient | null = (await getDocRest('clientes_registry', subdomain)) as TenantClient | null;
      if (!clientData) {
        const matched = await queryFirestoreRest(
          'clientes_registry',
          { field: 'subdominio', op: 'EQUAL', value: subdomain },
          1
        );
        if (matched.length > 0) {
          clientData = matched[0] as TenantClient;
        } else {
          const allClients = await queryFirestoreRest('clientes_registry', undefined, 100);
          const cleanTarget = subdomain.replace(/[^a-z0-9]/g, '');
          const found = allClients.find((c: any) => {
            const cSub = (c.subdominio || '').toLowerCase();
            const cProj = (c.firebaseConfig?.projectId || '').toLowerCase();
            return cSub === subdomain || cProj === subdomain || cSub.replace(/[^a-z0-9]/g, '') === cleanTarget;
          });
          if (found) clientData = found as TenantClient;
        }
      }

      if (clientData && clientData.firebaseConfig) {
        targetConfig = clientData.firebaseConfig;
      }
    }

    const liderancas = await queryFirestoreRest('liderancas', undefined, 1000, targetConfig);

    return NextResponse.json({
      success: true,
      subdomain,
      liderancas
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Erro na rota /api/tenant/liderancas:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Falha ao buscar lideranças'
    }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
