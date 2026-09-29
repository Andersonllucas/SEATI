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
  const { searchParams } = new URL(request.url);
  const rawSubdomain = searchParams.get('subdomain');

  if (!rawSubdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomínio não informado' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const subdomain = rawSubdomain.trim().toLowerCase();

  // Caso especial: subdomínio "admin" é reservado para a plataforma master
  if (subdomain === 'admin') {
    return NextResponse.json({
      success: true,
      isAdminDomain: true,
      subdomain: 'admin'
    }, { headers: NO_CACHE_HEADERS });
  }

  // Subdomínios padrão em preview/dev ('demo', 'preview', 'teresina'):
  // Retorna diretamente a base central sem requisições adicionais
  if (subdomain === 'demo' || subdomain === 'preview' || subdomain === 'teresina') {
    return NextResponse.json({
      success: true,
      subdomain,
      client: {
        id: subdomain,
        subdominio: subdomain,
        nome: 'Campanha Teresina (Cliente Padrão)',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      }
    }, { headers: NO_CACHE_HEADERS });
  }

  try {
    // Tenta busca direta por ID do documento via REST
    const directDoc = await getDocRest('clientes_registry', subdomain);

    let clientData: TenantClient | null = null;

    if (directDoc) {
      clientData = directDoc as TenantClient;
    } else {
      // Tenta busca por campo subdominio (tolerante a maiúsculas/minúsculas)
      const matched = await queryFirestoreRest(
        'clientes_registry',
        { field: 'subdominio', op: 'EQUAL', value: subdomain },
        1
      );

      if (matched.length > 0) {
        clientData = matched[0] as TenantClient;
      }
    }

    // Se o subdomínio padrão em preview/dev ('demo', 'preview' ou 'teresina') não tiver registro,
    // retorna a base central como cliente demonstrativo ativo
    if (!clientData && (subdomain === 'demo' || subdomain === 'preview' || subdomain === 'teresina')) {
      clientData = {
        id: subdomain,
        subdominio: subdomain,
        nome: 'Campanha Teresina (Cliente Padrão)',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };
    }

    if (!clientData) {
      return NextResponse.json({
        success: false,
        reason: 'not_found',
        subdomain,
        message: `Cliente com subdomínio "${subdomain}" não foi localizado no cadastro.`
      }, { status: 404, headers: NO_CACHE_HEADERS });
    }

    const currentStatus = (clientData.status || '').toString().trim().toLowerCase();
    if (currentStatus !== 'ativo') {
      return NextResponse.json({
        success: false,
        reason: 'inactive',
        subdomain,
        nome: clientData.nome,
        message: `O acesso para "${clientData.nome}" (${subdomain}.adti.app.br) está temporariamente inativo.`
      }, { status: 403, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      subdomain,
      client: clientData
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Erro ao resolver subdomínio no clientes_registry:', error);
    return NextResponse.json({
      success: false,
      reason: 'error',
      subdomain,
      error: error?.message || 'Erro ao consultar clientes_registry'
    }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
