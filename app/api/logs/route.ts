import { NextRequest, NextResponse } from 'next/server';
import { addDocRest, getDocRest } from '@/lib/firestoreRest';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tipo, usuarioId, usuarioNome, usuarioEmail, usuarioPerfil, acao, detalhes, entidade, entidadeId, subdomain } = body;

    let clientConfig: any = undefined;
    const cleanSub = typeof subdomain === 'string' ? subdomain.trim().toLowerCase() : '';
    if (cleanSub && cleanSub !== 'admin' && cleanSub !== 'demo' && cleanSub !== 'preview') {
      try {
        const clientDoc = await getDocRest('clientes_registry', cleanSub);
        if (clientDoc && clientDoc.firebaseConfig && clientDoc.firebaseConfig.projectId) {
          clientConfig = {
            projectId: clientDoc.firebaseConfig.projectId,
            apiKey: clientDoc.firebaseConfig.apiKey,
            databaseId: clientDoc.firebaseConfig.firestoreDatabaseId || '(default)'
          };
        }
      } catch (err) {
        console.warn('[API /api/logs] Falha ao resolver banco do tenant:', err);
      }
    }

    await addDocRest('logs_auditoria', {
      tipo: tipo || 'ACESSO',
      usuarioId: usuarioId || 'anonimo',
      usuarioNome: usuarioNome || 'Usuário do Sistema',
      usuarioEmail: usuarioEmail || 'sistema@campanha.com',
      usuarioPerfil: usuarioPerfil || 'Operador',
      acao: acao || 'Registro de auditoria',
      detalhes: detalhes || '',
      entidade: entidade || 'Sistema',
      entidadeId: entidadeId || '',
      data: new Date().toISOString()
    }, clientConfig);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.warn('Aviso na gravação de log pelo backend (ignorado com segurança):', error?.message);
    return NextResponse.json({ success: false, warning: error?.message }, { status: 200 });
  }
}
