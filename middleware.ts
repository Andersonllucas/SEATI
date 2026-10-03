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

  // Detecta se é uma requisição interna de RSC (React Server Component) ou prefetch
  const isRSC =
    request.headers.get('rsc') === '1' ||
    request.nextUrl.searchParams.has('_rsc') ||
    request.headers.has('next-router-prefetch') ||
    request.headers.has('next-router-state-tree');

  // Captura o hostname da requisição
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host || '';
  const hostname = hostHeader.split(':')[0].toLowerCase().trim();

  // Verifica se está em ambiente de desenvolvimento ou preview Cloud Run
  const isDevOrPreview =
    hostname.endsWith('.run.app') ||
    hostname.includes('localhost') ||
    hostname.includes('127.0.0.1') ||
    !hostname.includes('.');

  // 1. DOMÍNIO EXCLUSIVO DO ADMIN MASTER (admin.adti.app.br)
  if (hostname === 'admin.adti.app.br') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-is-admin-domain', 'true');
    requestHeaders.set('x-tenant-subdomain', 'admin');

    // Se estiver acessando a raiz ou rota interna que não seja /admin-master, redireciona para o painel isolado
    if (pathname !== '/admin-master' && !isRSC) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin-master';
      return NextResponse.redirect(url, {
        headers: requestHeaders
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

  // Se o primeiro rótulo for "admin", redireciona para a área master isolada
  if (subdomain === 'admin') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-is-admin-domain', 'true');
    requestHeaders.set('x-tenant-subdomain', 'admin');

    if (pathname !== '/admin-master' && !isRSC) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin-master';
      return NextResponse.redirect(url, {
        headers: requestHeaders
      });
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // Se for domínio de cliente (*.adti.app.br) e tentar acessar /admin-master, redireciona para o domínio exclusivo
  if (subdomain && subdomain !== 'admin' && pathname.startsWith('/admin-master') && !isRSC) {
    return NextResponse.redirect('https://admin.adti.app.br/admin-master');
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

  // 3. Em ambientes Cloud Run, Dev, Preview ou requisições RSC:
  // NUNCA faz sub-requisição fetch() interna dentro do middleware (evita loop/timeout que quebra o payload RSC)
  if (isDevOrPreview || isRSC || subdomain === 'demo' || subdomain === 'preview' || subdomain === 'teresina') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-tenant-id', subdomain);
    requestHeaders.set('x-tenant-name', encodeURIComponent(subdomain === 'demo' ? 'Campanha Teresina' : subdomain));
    requestHeaders.set('x-is-admin-domain', 'false');

    const response = NextResponse.next({
      request: { headers: requestHeaders }
    });

    if (!isRSC && subdomain && subdomain !== 'admin') {
      response.cookies.set('adti_subdomain', subdomain, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax'
      });
    }

    return response;
  }

  // 4. RESOLUÇÃO E VALIDAÇÃO DO CLIENTE PERSONALIZADO (PRODUÇÃO *.adti.app.br)
  try {
    const resolveUrl = new URL(`/api/tenant/resolve?subdomain=${encodeURIComponent(subdomain)}`, request.url);
    const resolveRes = await fetch(resolveUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
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
    if (!isRSC && subdomain && subdomain !== 'admin') {
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
    if (!isRSC && subdomain && subdomain !== 'admin') {
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
