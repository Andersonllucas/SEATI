import { NextRequest, NextResponse } from 'next/server';
import { queryFirestoreRest, getDocRest } from '@/lib/firestoreRest';
import { verifyPassword } from '@/lib/crypto';
import { createFirebaseCustomToken, getServiceAccountCredentials } from '@/lib/firebaseCustomToken';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, senha, subdomain } = body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanSenha = typeof senha === 'string' ? senha.trim() : '';
    const cleanSub = typeof subdomain === 'string' ? subdomain.trim().toLowerCase() : '';

    if (!cleanEmail || !cleanSenha) {
      return NextResponse.json(
        { success: false, error: 'E-mail e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    // 1. Determina se é subdomínio de cliente
    const isClientSubdomain = Boolean(cleanSub && cleanSub !== 'admin' && cleanSub !== 'demo' && cleanSub !== 'preview');
    let clientConfig: any = undefined;

    if (isClientSubdomain) {
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
        console.warn('[API /api/auth/token] Aviso ao buscar config do tenant:', err);
      }
    }

    // 2. Conecta ao banco Firestore para buscar o usuário via REST
    let users: any[] = [];

    if (isClientSubdomain) {
      // Se subdomain for de um cliente, a busca deve acontecer SOMENTE no banco daquele cliente.
      // Se não encontrar, retorna erro de credenciais inválidas — NUNCA cai para o central.
      if (clientConfig) {
        try {
          users = await queryFirestoreRest('usuarios', { field: 'email', op: 'EQUAL', value: cleanEmail }, 1, clientConfig);
          if (users.length === 0 && email.trim() !== cleanEmail) {
            users = await queryFirestoreRest('usuarios', { field: 'email', op: 'EQUAL', value: email.trim() }, 1, clientConfig);
          }
        } catch (clientQueryErr) {
          console.warn('[API /api/auth/token] Busca de usuário no banco do cliente falhou:', clientQueryErr);
        }
      }

      if (users.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Credenciais inválidas para esta campanha.' },
          { status: 401 }
        );
      }
    } else {
      // O fallback para o banco central só pode acontecer quando NENHUM subdomínio de cliente for informado (login vindo do painel master)
      users = await queryFirestoreRest('usuarios', { field: 'email', op: 'EQUAL', value: cleanEmail }, 1);
      if (users.length === 0 && email.trim() !== cleanEmail) {
        users = await queryFirestoreRest('usuarios', { field: 'email', op: 'EQUAL', value: email.trim() }, 1);
      }
    }

    const userData: any = users[0];
    const userId: string = userData?.id;

    if (!userData) {
      return NextResponse.json(
        { success: false, error: 'E-mail ou senha incorretos.' },
        { status: 401 }
      );
    }

    // 3. Valida status do usuário
    if (userData.status === 'Inativo') {
      return NextResponse.json(
        { success: false, error: 'Esta conta de usuário está desativada. Contate o administrador.' },
        { status: 403 }
      );
    }

    // 4. Valida a senha
    if (!userData.senha) {
      return NextResponse.json(
        { success: false, error: 'E-mail ou senha incorretos.' },
        { status: 401 }
      );
    }

    const senhaValida = await verifyPassword(cleanSenha, userData.senha);

    if (!senhaValida) {
      return NextResponse.json(
        { success: false, error: 'E-mail ou senha incorretos.' },
        { status: 401 }
      );
    }

    // 5. Tentativa opcional de emissão de Custom Token (se serviceAccount estiver configurada)
    let customToken: string | null = null;
    try {
      const serviceAccount = getServiceAccountCredentials();
      if (serviceAccount) {
        const claims = {
          perfil: userData.perfil || 'Operador',
          email: userData.email,
          nome: userData.nome || ''
        };
        customToken = createFirebaseCustomToken(userId, claims, serviceAccount);
      }
    } catch (tokenErr) {
      console.warn(
        '[API /api/auth/token] Custom Token não pôde ser gerado (opcional, login local mantido):',
        tokenErr
      );
    }

    // Retorna a confirmação de autenticação e os dados sanitizados do usuário
    return NextResponse.json({
      success: true,
      customToken,
      user: {
        id: userId,
        nome: userData.nome,
        email: userData.email,
        perfil: userData.perfil,
        status: userData.status,
        telefone: userData.telefone || '',
        cargo: userData.cargo || '',
        senhaProvisoria: !!userData.senhaProvisoria
      }
    });
  } catch (error: any) {
    console.error('Erro na emissão do Firebase Custom Token:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Falha interna ao processar autenticação.'
      },
      { status: 500 }
    );
  }
}
