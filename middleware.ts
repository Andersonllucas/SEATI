import { NextRequest, NextResponse } from 'next/server';

// Prefixo e URLs que não devem passar pela resolução de subdomínio
const PUBLIC_FILE_PATTERN = /\.(.*)$/;
const EXCLUDED_PATHS = ['/_next', '/api', '/favicon.ico', '/apple-touch-icon.png', '/tenant-error'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignora assets estáticos e rotas internas do Next.js
  if (
    EXCLUDED_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Captura o hostname da requisição
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host || '';
  const hostname = hostHeader.split(':')[0].toLowerCase().trim();

  // 1. DOMÍNIO EXCLUSIVO DO ADMIN MASTER (admin.adti.app.br)
  if (hostname === 'admin.adti.app.br') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-is-admin-domain', 'true');
    requestHeaders.set('x-tenant-subdomain', 'admin');

    // Se estiver acessando a raiz do domínio admin, reescreve diretamente para o painel /admin-master
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin-master';
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders }
      });
    }

    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // 2. EXTRAÇÃO DO PRIMEIRO RÓTULO DO SUBDOMÍNIO (*.adti.app.br)
  let subdomain: string | null = null;

  if (hostname.endsWith('.adti.app.br')) {
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      subdomain = parts[0].toLowerCase();
    }
  }

  // Se o primeiro rótulo for "admin", redireciona para a área master
  if (subdomain === 'admin') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-is-admin-domain', 'true');
    requestHeaders.set('x-tenant-subdomain', 'admin');

    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin-master';
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders }
      });
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // Suporte a ambientes de desenvolvimento ou preview Cloud Run
  if (!subdomain) {
    const querySub = request.nextUrl.searchParams.get('subdomain');
    const cookieSub = request.cookies.get('adti_subdomain')?.value;

    if (querySub) {
      subdomain = querySub.toLowerCase().trim();
    } else if (cookieSub && cookieSub.trim() && cookieSub !== 'admin') {
      subdomain = cookieSub.toLowerCase().trim();
    } else {
      // Se for acesso direto a /admin-master em desenvolvimento, permite
      if (pathname.startsWith('/admin-master')) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-is-admin-domain', 'true');
        requestHeaders.set('x-tenant-subdomain', 'admin');
        return NextResponse.next({
          request: { headers: requestHeaders }
        });
      }
      // Em preview sem subdomínio específico, continua com o tenant demonstrativo
      subdomain = 'demo';
    }
  }

  // Se for subdomínio padrão de desenvolvimento/preview, resolve instantaneamente sem fetch interno
  if (subdomain === 'demo' || subdomain === 'preview' || subdomain === 'teresina') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-tenant-id', subdomain);
    requestHeaders.set('x-tenant-name', encodeURIComponent('Campanha Teresina'));
    requestHeaders.set('x-is-admin-domain', 'false');

    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });

    response.cookies.set('adti_subdomain', subdomain, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax'
    });

    return response;
  }

  // 3. RESOLUÇÃO E VALIDAÇÃO DO CLIENTE PERSONALIZADO
  try {
    const resolveUrl = new URL(`/api/tenant/resolve?subdomain=${encodeURIComponent(subdomain)}`, request.url);
    const resolveRes = await fetch(resolveUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 } // Cache curto de 60 segundos no edge worker
    });

    const contentType = resolveRes.headers.get('content-type') || '';
    if (!resolveRes.ok || !contentType.includes('application/json')) {
      throw new Error(`Resposta não-JSON (${resolveRes.status}) ao resolver tenant`);
    }

    const data = await resolveRes.json();

    if (!data.success) {
      // Se não for encontrado ou estiver inativo, reescreve para a página de erro amigável
      const reason = data.reason || 'not_found';
      const errorUrl = request.nextUrl.clone();
      errorUrl.pathname = '/tenant-error';
      errorUrl.searchParams.set('subdomain', subdomain);
      errorUrl.searchParams.set('reason', reason);
      if (data.message) {
        errorUrl.searchParams.set('message', data.message);
      }
      return NextResponse.rewrite(errorUrl);
    }

    // Cliente ativo e validado: injeta dados no cabeçalho da requisição
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-tenant-id', data.client?.id || subdomain);
    requestHeaders.set('x-tenant-name', encodeURIComponent(data.client?.nome || ''));
    requestHeaders.set('x-is-admin-domain', 'false');

    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });

    // Se o subdomínio foi informado ou atualizado, grava no cookie para manter navegação íntegra
    if (subdomain && subdomain !== 'admin') {
      response.cookies.set('adti_subdomain', subdomain, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax'
      });
    }

    return response;
  } catch (err) {
    console.error('Falha na resolução de tenant pelo middleware:', err);
    // Em caso de falha de conexão no edge, permite a continuação com resolução client-side de fallback
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-is-admin-domain', 'false');
    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });
    if (subdomain && subdomain !== 'admin') {
      response.cookies.set('adti_subdomain', subdomain, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax'
      });
    }
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
