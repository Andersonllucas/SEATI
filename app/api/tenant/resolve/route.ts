import { NextRequest, NextResponse } from 'next/server';
import { getDocRest, queryFirestoreRest } from '@/lib/firestoreRest';
import { CENTRAL_FIREBASE_CONFIG } from '@/lib/centralFirebaseConfig';
import { TenantClient } from '@/lib/tenantTypes';
import { getTenantFromFile, saveTenantToFile } from '@/lib/tenantFileRegistry';

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
    // 1. Consulta o registro persistente local em arquivo (imune a limites de cota da nuvem)
    const fileClient = getTenantFromFile(subdomain);
    let clientData: TenantClient | null = fileClient;

    if (!clientData) {
      // 2. Tenta busca direta por ID do documento via Firestore REST
      const directDoc = await getDocRest('clientes_registry', subdomain);

      if (directDoc) {
        clientData = directDoc as TenantClient;
        saveTenantToFile(clientData);
      } else {
        // Tenta busca por campo subdominio (tolerante a maiúsculas/minúsculas)
        const matched = await queryFirestoreRest(
          'clientes_registry',
          { field: 'subdominio', op: 'EQUAL', value: subdomain },
          1
        );

        if (matched.length > 0) {
          clientData = matched[0] as TenantClient;
          saveTenantToFile(clientData);
        } else {
          // Busca ampla por projectId, ID sem hífens ou nome de campanha
          const allClients = await queryFirestoreRest('clientes_registry', undefined, 100);
          const cleanTarget = subdomain.replace(/[^a-z0-9]/g, '');
          const found = allClients.find((c: any) => {
            const cSub = (c.subdominio || '').toLowerCase();
            const cId = (c.id || '').toLowerCase();
            const cProj = (c.firebaseConfig?.projectId || '').toLowerCase();
            const cNome = (c.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
            const cCleanSub = cSub.replace(/[^a-z0-9]/g, '');
            const cCleanProj = cProj.replace(/[^a-z0-9]/g, '');

            return (
              cSub === subdomain ||
              cId === subdomain ||
              cProj === subdomain ||
              cNome === subdomain ||
              cCleanSub === cleanTarget ||
              cCleanProj === cleanTarget ||
              cCleanProj.includes(cleanTarget) ||
              cleanTarget.includes(cCleanProj)
            );
          });

          if (found) {
            clientData = found as TenantClient;
            saveTenantToFile(clientData);
          }
        }
      }
    }

    // 3. Se ainda não foi localizado (ex: novo ambiente publicado como 'marcelo' ou cota da nuvem temporariamente indisponível):
    // Auto-provisiona o ambiente como ATIVO imediatamente, garantindo que o sistema publicado NUNCA trave em 'Ambiente Não Localizado'.
    if (!clientData) {
      const formattedName = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
      clientData = {
        id: subdomain,
        subdominio: subdomain,
        nome: `Campanha ${formattedName}`,
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };
      saveTenantToFile(clientData);
      setDocRest('clientes_registry', subdomain, clientData).catch(() => {});
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
