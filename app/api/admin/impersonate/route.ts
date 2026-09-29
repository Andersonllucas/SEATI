import { NextRequest, NextResponse } from 'next/server';
import { getDocRest, queryFirestoreRest } from '@/lib/firestoreRest';
import { TenantClient } from '@/lib/tenantTypes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subdomain, masterUser } = body;

    const cleanSub = typeof subdomain === 'string' ? subdomain.trim().toLowerCase() : '';
    if (!cleanSub) {
      return NextResponse.json(
        { success: false, error: 'Subdomínio do cliente é obrigatório.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (cleanSub === 'admin') {
      return NextResponse.json(
        { success: false, error: 'O subdomínio "admin" é reservado para o painel master.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 1. Busca dados do cliente no clientes_registry
    let client: TenantClient | null = await getDocRest('clientes_registry', cleanSub);
    if (!client) {
      const results = await queryFirestoreRest(
        'clientes_registry',
        { field: 'subdominio', op: 'EQUAL', value: cleanSub },
        1
      );
      if (results.length > 0) {
        client = results[0] as TenantClient;
      }
    }

    if (!client) {
      return NextResponse.json(
        { success: false, error: `Cliente com subdomínio "${cleanSub}" não encontrado no cadastro.` },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    if ((client.status || '').toLowerCase() === 'inativo') {
      return NextResponse.json(
        { success: false, error: `O cliente "${client.nome}" está desativado no momento.` },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    // 2. Cria sessão de impersonação administrativa para o Master
    const impersonatorName = masterUser?.nome || 'Administrador Master';
    const impersonatorEmail = masterUser?.email || 'master@adti.app.br';

    const impersonatedUser = {
      id: `master_support_${cleanSub}`,
      nome: `${impersonatorName} (Suporte Master)`,
      email: impersonatorEmail,
      perfil: 'Administrador',
      status: 'Ativo',
      municipio: client.nome,
      subdomain: cleanSub,
      isMasterSupport: true,
      dataCadastro: new Date().toISOString()
    };

    return NextResponse.json(
      {
        success: true,
        client,
        user: impersonatedUser,
        message: `Sessão de suporte autorizada para ${client.nome} (${cleanSub}).`
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/admin/impersonate:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Falha ao autorizar acesso do master ao cliente.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
