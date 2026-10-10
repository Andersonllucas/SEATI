import { NextRequest, NextResponse } from 'next/server';
import { batchCommitRest, queryFirestoreRest, FirestoreWriteOp } from '@/lib/firestoreRest';
import { TenantFirebaseConfig } from '@/lib/tenantTypes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

/**
 * Consulta todas as apurações de seções salvas no Firestore do cliente ou central
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const databaseId = url.searchParams.get('databaseId');
    const apiKey = url.searchParams.get('apiKey');

    const cfg = projectId ? { projectId, databaseId: databaseId || '(default)', apiKey: apiKey || undefined } : undefined;

    const docs = await queryFirestoreRest('apuracao_secoes', undefined, 2000, cfg);
    return NextResponse.json({
      success: true,
      count: docs.length,
      apuracoes: docs
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Erro ao buscar apurações no Firestore:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Falha ao buscar apurações'
    }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

/**
 * Grava lote de seções apuradas diretamente no Firestore REST (atômico e persistente)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { items, firebaseConfig } = body as {
      items: Array<{
        id?: string;
        zona: string;
        secao: string;
        votosApurados: number;
        dataApuracao?: string;
        apuradoPor?: string;
        boletimUrna?: string;
        observacoes?: string;
      }>;
      firebaseConfig?: TenantFirebaseConfig;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum item informado para importação.'
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const ops: FirestoreWriteOp[] = items.map((it) => {
      const zClean = String(it.zona || '').trim();
      const sClean = String(it.secao || '').trim();
      const zNorm = zClean.replace(/\D/g, '') ? String(parseInt(zClean.replace(/\D/g, ''), 10)) : zClean.toLowerCase();
      const sNorm = sClean.replace(/\D/g, '') ? String(parseInt(sClean.replace(/\D/g, ''), 10)) : sClean.toLowerCase();
      const docId = it.id || `z${zNorm}_s${sNorm}`;

      return {
        type: 'update',
        collectionId: 'apuracao_secoes',
        docId,
        data: {
          id: docId,
          zona: zClean,
          secao: sClean,
          votosApurados: Number.isFinite(it.votosApurados) ? Math.max(0, Math.round(it.votosApurados)) : 0,
          dataApuracao: it.dataApuracao || nowIso,
          apuradoPor: it.apuradoPor || 'Coordenação',
          boletimUrna: it.boletimUrna ? String(it.boletimUrna).trim() : '',
          observacoes: it.observacoes ? String(it.observacoes).trim() : 'Importação de Boletim de Urna'
        }
      };
    });

    const cfg = firebaseConfig?.projectId
      ? {
          projectId: firebaseConfig.projectId,
          databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
          apiKey: firebaseConfig.apiKey
        }
      : undefined;

    const result = await batchCommitRest(ops, cfg);

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} seções salvas diretamente no banco Firestore com sucesso!`
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Erro na API /api/apuracao/batch (POST):', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Falha ao gravar apurações no banco'
    }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

/**
 * Exclui todas as apurações do banco Firestore
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { firebaseConfig, ids } = body as {
      firebaseConfig?: TenantFirebaseConfig;
      ids?: string[];
    };

    const cfg = firebaseConfig?.projectId
      ? {
          projectId: firebaseConfig.projectId,
          databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
          apiKey: firebaseConfig.apiKey
        }
      : undefined;

    let targetIds = ids || [];
    if (!targetIds.length) {
      const existing = await queryFirestoreRest('apuracao_secoes', undefined, 2000, cfg);
      targetIds = existing.map((d: any) => d.id).filter(Boolean);
    }

    if (!targetIds.length) {
      return NextResponse.json({ success: true, count: 0, message: 'Nenhuma apuração para excluir.' });
    }

    const ops: FirestoreWriteOp[] = targetIds.map((id) => ({
      type: 'delete',
      collectionId: 'apuracao_secoes',
      docId: id
    }));

    const result = await batchCommitRest(ops, cfg);

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} apurações removidas do banco Firestore com sucesso!`
    }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Erro ao excluir apurações no banco:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Falha ao excluir apurações'
    }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
