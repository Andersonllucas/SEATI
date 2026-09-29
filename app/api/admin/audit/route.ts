import { NextRequest, NextResponse } from 'next/server';
import { queryFirestoreRest, addDocRest } from '@/lib/firestoreRest';

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
    const limitCount = parseInt(searchParams.get('limit') || '100', 10);

    // Consulta na coleção canônica logs_auditoria ordenada pelos mais recentes
    const rawLogs = await queryFirestoreRest(
      'logs_auditoria',
      undefined,
      limitCount,
      undefined,
      { field: 'data', direction: 'DESCENDING' }
    );

    // Mapeia e normaliza os logs para a interface da aba de Auditoria Global
    const formattedLogs = rawLogs.map((item: any) => {
      const ts = item.data || item.timestamp || item.criadoEm || item.createdAt || new Date().toISOString();
      const rawAcao = (item.acao || '').toString();

      return {
        id: item.id || `log_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: ts,
        tenantSubdominio: item.tenantSubdominio || item.subdominio || 'central',
        tenantNome: item.tenantNome || (item.subdominio ? `Campanha ${item.subdominio}` : 'Banco Central / Demonstração'),
        autorEmail: item.autorEmail || item.usuarioEmail || 'sistema@campanha.com',
        usuarioNome: item.usuarioNome || 'Usuário do Sistema',
        acao: rawAcao || 'Ação registrada',
        detalhes: item.detalhes || item.descricao || '',
        tipo: item.tipo || 'SISTEMA',
        entidade: item.entidade || ''
      };
    });

    // Ordena os logs em ordem decrescente (mais recentes primeiro)
    formattedLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    return NextResponse.json(
      {
        success: true,
        count: formattedLogs.length,
        rawCount: rawLogs.length,
        logs: formattedLogs
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error('Erro na API /api/admin/audit (GET):', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao buscar logs de auditoria.', stack: error?.stack },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantSubdominio, tenantNome, autorEmail, acao, detalhes, tipo, entidade } = body;

    if (!acao || !detalhes) {
      return NextResponse.json(
        { success: false, error: 'Ação e detalhes são obrigatórios.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    const cleanSub = (tenantSubdominio || 'central').toLowerCase();

    const logEntry = {
      tipo: tipo || 'ADMIN_MASTER',
      entidade: entidade || 'Cliente / Tenant',
      tenantSubdominio: cleanSub,
      subdominio: cleanSub,
      tenantNome: tenantNome || (cleanSub === 'central' ? 'Banco Central / Demonstração' : `Campanha ${cleanSub}`),
      autorEmail: autorEmail || 'admin@master',
      usuarioEmail: autorEmail || 'admin@master',
      usuarioNome: autorEmail ? autorEmail.split('@')[0] : 'Admin Master',
      usuarioPerfil: 'Administrador',
      acao,
      detalhes,
      data: nowIso,
      timestamp: nowIso
    };

    const docId = await addDocRest('logs_auditoria', logEntry);

    return NextResponse.json(
      {
        success: true,
        id: docId,
        log: { ...logEntry, id: docId }
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error('Erro na API /api/admin/audit (POST):', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao gravar log de auditoria.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
