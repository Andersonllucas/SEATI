import { NextRequest, NextResponse } from 'next/server';
import { bootstrapTenantDatabase } from '@/lib/firebase';
import { TenantBootstrapOptions, TenantFirebaseConfig } from '@/lib/tenantTypes';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { firebaseConfig, options } = body as {
      firebaseConfig: TenantFirebaseConfig;
      options: TenantBootstrapOptions;
    };

    if (!firebaseConfig || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'Credenciais do Firebase do cliente são obrigatórias.' },
        { status: 400 }
      );
    }

    if (!options || !options.subdominio || !options.nomeCampanha || !options.adminEmail || !options.adminSenha) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: subdominio, nomeCampanha, adminEmail e adminSenha.' },
        { status: 400 }
      );
    }

    const result = await bootstrapTenantDatabase(firebaseConfig, options);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || result.message },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Erro na rota /api/admin/bootstrap-tenant:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Falha ao inicializar banco do cliente.' },
      { status: 500 }
    );
  }
}
