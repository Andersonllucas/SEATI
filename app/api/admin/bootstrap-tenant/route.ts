import { NextRequest, NextResponse } from 'next/server';
import { bootstrapTenantDatabase } from '@/lib/firebase';
import { setDocRest } from '@/lib/firestoreRest';
import { hashPassword } from '@/lib/crypto';
import { saveUserToFile } from '@/lib/userFileRegistry';
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

    const cleanAdminEmail = options.adminEmail.trim().toLowerCase();
    const cleanOperadorEmail = (options.operadorEmail || `operador@${options.subdominio}.adti.app.br`).trim().toLowerCase();
    const cleanAdminSenha = options.adminSenha.trim();
    const cleanOperadorSenha = (options.operadorSenha || '123456').trim();

    let result = await bootstrapTenantDatabase(firebaseConfig, options);

    // Fallback REST direto caso o SDK em ambiente server enfrente instabilidade
    if (!result || !result.success) {
      console.warn('[API bootstrap-tenant] Tentativa via SDK falhou, executando provisionamento via REST direto...');
      try {
        const targetConfig = {
          projectId: firebaseConfig.projectId,
          apiKey: firebaseConfig.apiKey,
          databaseId: firebaseConfig.firestoreDatabaseId || '(default)'
        };

        const adminPasswordHash = await hashPassword(cleanAdminSenha);
        const operadorPasswordHash = await hashPassword(cleanOperadorSenha);
        const adminDocId = cleanAdminEmail.replace(/[^a-z0-9_]/g, '_');
        const operadorDocId = cleanOperadorEmail.replace(/[^a-z0-9_]/g, '_');

        // 1. Grava configuracoes/geral via REST
        await setDocRest(
          'configuracoes',
          'geral',
          {
            nomeCampanha: options.nomeCampanha.trim(),
            cargo: options.cargo || 'Prefeito / Vereador / Deputado',
            anoEleicao: options.anoEleicao || '2026',
            metaVotos: Number(options.metaVotos) || 5000,
            municipio: options.municipio || 'Teresina',
            uf: options.uf || 'PI',
            subdominio: options.subdominio.trim().toLowerCase(),
            dataCriacao: new Date().toISOString()
          },
          targetConfig
        );

        // 2. Grava usuário Administrador via REST
        await setDocRest(
          'usuarios',
          adminDocId,
          {
            id: adminDocId,
            nome: options.adminNome?.trim() || `Administrador ${options.nomeCampanha}`,
            email: cleanAdminEmail,
            senha: adminPasswordHash,
            perfil: 'Administrador',
            status: 'Ativo',
            senhaProvisoria: true,
            criadoEm: new Date().toISOString()
          },
          targetConfig
        );

        // 3. Grava usuário Operador via REST
        await setDocRest(
          'usuarios',
          operadorDocId,
          {
            id: operadorDocId,
            nome: options.operadorNome?.trim() || `Operador ${options.nomeCampanha}`,
            email: cleanOperadorEmail,
            senha: operadorPasswordHash,
            perfil: 'Operador',
            status: 'Ativo',
            senhaProvisoria: true,
            criadoEm: new Date().toISOString()
          },
          targetConfig
        );

        result = {
          success: true,
          message: `Banco do cliente "${options.nomeCampanha}" inicializado com sucesso via REST com usuários Administrador e Operador!`,
          adminEmail: cleanAdminEmail,
          adminSenha: cleanAdminSenha,
          operadorEmail: cleanOperadorEmail,
          operadorSenha: cleanOperadorSenha,
          loginUrl: `https://${options.subdominio}.adti.app.br/login`,
          collectionsCreated: ['configuracoes', 'usuarios'],
          locaisImportados: 0
        };
      } catch (restErr: any) {
        console.error('[API bootstrap-tenant] Falha no fallback REST:', restErr);
      }
    }

    if (!result || !result.success) {
      return NextResponse.json(
        { success: false, error: result?.error || result?.message || 'Falha ao provisionar banco do cliente.' },
        { status: 500 }
      );
    }

    // Registra os usuários criados no registro local para contingência e login garantido
    try {
      saveUserToFile({
        id: cleanAdminEmail.replace(/[^a-z0-9_]/g, '_'),
        nome: options.adminNome?.trim() || `Administrador ${options.nomeCampanha}`,
        email: cleanAdminEmail,
        perfil: 'Administrador',
        status: 'Ativo',
        senha: cleanAdminSenha,
        senhaProvisoria: true,
        dataCadastro: new Date().toISOString()
      });

      saveUserToFile({
        id: cleanOperadorEmail.replace(/[^a-z0-9_]/g, '_'),
        nome: options.operadorNome?.trim() || `Operador ${options.nomeCampanha}`,
        email: cleanOperadorEmail,
        perfil: 'Operador',
        status: 'Ativo',
        senha: cleanOperadorSenha,
        senhaProvisoria: true,
        dataCadastro: new Date().toISOString()
      });
    } catch (saveErr) {
      console.warn('[API bootstrap-tenant] Aviso ao salvar contingência local:', saveErr);
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
