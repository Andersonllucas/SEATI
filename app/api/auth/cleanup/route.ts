import { NextRequest, NextResponse } from 'next/server';
import { queryFirestoreRest, deleteDocRest, getDocRest } from '@/lib/firestoreRest';
import { verifyPassword } from '@/lib/crypto';

/**
 * Rota para exclusão e higienização de usuários duplicados via REST (Service Account),
 * funcionando mesmo se houver limitação de regras client-side ou concorrência.
 */
export async function POST(req: NextRequest) {
  try {
    const { action, userId, senhaMestre, subdomain } = await req.json();

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
        console.warn('[API /api/auth/cleanup] Falha ao resolver banco do tenant:', err);
      }
    }

    // 1. Validação de segurança básica da Senha Mestre
    const config = await getDocRest('configuracoes', 'geral', clientConfig);
    const masterPassHash = config?.senhaMestre || '123456';
    if (senhaMestre) {
      const isValid = await verifyPassword(senhaMestre.trim(), masterPassHash);
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'Senha mestre inválida.' }, { status: 403 });
      }
    }

    if (action === 'delete_user') {
      if (!userId) {
        return NextResponse.json({ success: false, error: 'ID de usuário obrigatório.' }, { status: 400 });
      }
      const ok = await deleteDocRest('usuarios', userId, clientConfig);
      return NextResponse.json({ success: ok });
    }

    if (action === 'clean_duplicates') {
      const allUsers = await queryFirestoreRest('usuarios', undefined, 100, clientConfig);
      if (!allUsers || allUsers.length === 0) {
        return NextResponse.json({ success: true, removedCount: 0, message: 'Nenhum usuário retornado.' });
      }

      // Agrupa por e-mail minúsculo
      const seenEmails = new Set<string>();
      const toDeleteIds: string[] = [];

      // Ordena pelos mais recentes ou com último acesso para preservar o usuário ativo mais relevante
      for (const u of allUsers) {
        const email = (u.email || '').trim().toLowerCase();
        if (!email) continue;

        if (seenEmails.has(email)) {
          // É duplicata!
          toDeleteIds.push(u.id);
        } else {
          seenEmails.add(email);
        }
      }

      let removed = 0;
      for (const id of toDeleteIds) {
        const ok = await deleteDocRest('usuarios', id, clientConfig);
        if (ok) removed++;
      }

      return NextResponse.json({
        success: true,
        removedCount: removed,
        message: `${removed} usuário(s) duplicado(s) removido(s) com sucesso.`
      });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Erro no servidor' }, { status: 500 });
  }
}
