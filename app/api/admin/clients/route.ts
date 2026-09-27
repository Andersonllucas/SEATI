import { NextRequest, NextResponse } from 'next/server';
import { setDocRest, deleteDocRest, getDocRest, queryFirestoreRest } from '@/lib/firestoreRest';

export async function GET() {
  try {
    const clients = await queryFirestoreRest('clientes_registry', undefined, 100);
    return NextResponse.json({
      success: true,
      clients
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao buscar clientes.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, nome, subdominio, status, firebaseConfig } = body;

    const cleanNome = typeof nome === 'string' ? nome.trim() : '';
    const cleanSub = typeof subdominio === 'string'
      ? subdominio.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      : '';
    const docId = (typeof id === 'string' && id.trim()) ? id.trim() : cleanSub;

    if (!cleanNome || !cleanSub || !docId) {
      return NextResponse.json(
        { success: false, error: 'Nome e subdomínio são obrigatórios.' },
        { status: 400 }
      );
    }

    if (cleanSub === 'admin') {
      return NextResponse.json(
        { success: false, error: 'O subdomínio "admin" é reservado.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const existingDoc = await getDocRest('clientes_registry', docId);

    const clientPayload: Record<string, any> = {
      id: docId,
      nome: cleanNome,
      subdominio: cleanSub,
      status: status || 'ativo',
      firebaseConfig: {
        projectId: (firebaseConfig?.projectId || '').trim(),
        apiKey: (firebaseConfig?.apiKey || '').trim(),
        authDomain: (firebaseConfig?.authDomain || `${firebaseConfig?.projectId || ''}.firebaseapp.com`).trim(),
        appId: (firebaseConfig?.appId || '').trim(),
        firestoreDatabaseId: (firebaseConfig?.firestoreDatabaseId || '(default)').trim(),
        storageBucket: (firebaseConfig?.storageBucket || `${firebaseConfig?.projectId || ''}.firebasestorage.app`).trim(),
        messagingSenderId: (firebaseConfig?.messagingSenderId || '').trim()
      },
      atualizadoEm: nowIso
    };

    if (!existingDoc) {
      clientPayload.criadoEm = nowIso;
    }

    const saved = await setDocRest('clientes_registry', docId, clientPayload);

    if (!saved) {
      return NextResponse.json(
        { success: false, error: 'Não foi possível salvar o cliente no banco central.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      client: clientPayload,
      message: 'Cliente salvo com sucesso!'
    });
  } catch (error: any) {
    console.error('Erro na API /api/admin/clients (POST):', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao processar cadastro do cliente.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !id.trim()) {
      return NextResponse.json(
        { success: false, error: 'ID do cliente é obrigatório para exclusão.' },
        { status: 400 }
      );
    }

    const cleanId = id.trim();
    if (cleanId === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Não é permitido excluir o identificador admin.' },
        { status: 400 }
      );
    }

    const deleted = await deleteDocRest('clientes_registry', cleanId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Falha ao excluir o cliente no banco central.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cliente ${cleanId} excluído com sucesso!`
    });
  } catch (error: any) {
    console.error('Erro na API /api/admin/clients (DELETE):', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao processar exclusão do cliente.' },
      { status: 500 }
    );
  }
}
