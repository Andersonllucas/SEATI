import { NextRequest, NextResponse } from 'next/server';
import { queryFirestoreRest } from '@/lib/firestoreRest';
import { TenantFirebaseConfig } from '@/lib/tenantTypes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firebaseConfig } = body as { firebaseConfig: TenantFirebaseConfig };

    if (!firebaseConfig || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Configuração do Firebase inválida ou incompleta'
      }, { status: 400 });
    }

    const [eleitores, liderancas, locais] = await Promise.all([
      queryFirestoreRest('eleitores', undefined, 100, firebaseConfig).catch(() => []),
      queryFirestoreRest('liderancas', undefined, 100, firebaseConfig).catch(() => []),
      queryFirestoreRest('locais_votacao', undefined, 100, firebaseConfig).catch(() => [])
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        eleitoresCount: eleitores.length,
        liderancasCount: liderancas.length,
        locaisCount: locais.length,
        lastChecked: new Date().toISOString(),
        status: 'ok'
      }
    });
  } catch (error: any) {
    console.error('Erro na rota de resumo de tenant:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Falha ao consultar resumo'
    }, { status: 500 });
  }
}
