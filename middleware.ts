import { NextRequest, NextResponse } from 'next/server';

// Prefixo e URLs que não devem passar pela resolução de subdomínio
const PUBLIC_FILE_PATTERN = /\.(.*)$/;
const EXCLUDED_PATHS = ['/_next', '/api', '/favicon.ico', '/apple-touch-icon.png', '/tenant-error', '/pwa-icon'];

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

  const isAdtiDomain = hostname.endsWith('.adti.app.br');

  // 1. DOMÍNIO EXCLUSIVO DO ADMIN MASTER (admin.adti.app.br)
  if (hostname === 'admin.adti.app.br') {
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

  // 2. EXTRAÇÃO DO SUBDOMÍNIO
  let subdomain: string | null = null;

  if (isAdtiDomain) {
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

  // Se for domínio de cliente e tentar acessar /admin-master, permite em desenvolvimento ou redireciona
  if (subdomain && subdomain !== 'admin' && pathname.startsWith('/admin-master') && !isRSC && isAdtiDomain) {
    return NextResponse.redirect('https://admin.adti.app.br/admin-master');
  }

  // Para qualquer ambiente publicado fora de *.adti.app.br ou se nenhum subdomínio foi identificado:
  if (!subdomain) {
    const querySub = request.nextUrl.searchParams.get('subdomain');
    const cookieSub = request.cookies.get('adti_subdomain')?.value;

    if (querySub) {
      subdomain = querySub.toLowerCase().trim();
    } else if (cookieSub && cookieSub.trim() && cookieSub !== 'admin') {
      subdomain = cookieSub.toLowerCase().trim();
    } else {
      if (pathname.startsWith('/admin-master')) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-is-admin-domain', 'true');
        requestHeaders.set('x-tenant-subdomain', 'admin');
        return NextResponse.next({
          request: { headers: requestHeaders }
        });
      }
      subdomain = 'demo';
    }
  }

  // 3. Ambientes publicados fora de *.adti.app.br (custom domain, Vercel, Cloud Run, VPS, local):
  // NUNCA trava a navegação com /tenant-error em domínios próprios/publicados.
  if (!isAdtiDomain || isRSC || subdomain === 'demo' || subdomain === 'preview' || subdomain === 'teresina') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-tenant-id', subdomain);
    requestHeaders.set('x-tenant-name', encodeURIComponent(subdomain === 'demo' ? 'Campanha Oficial' : subdomain));
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

  // 4. RESOLUÇÃO E VALIDAÇÃO EXCLUSIVA DE SUBDOMÍNIOS EM *.adti.app.br
  try {
    const resolveUrl = new URL(`/api/tenant/resolve?subdomain=${encodeURIComponent(subdomain)}`, request.url);
    const resolveRes = await fetch(resolveUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    const contentType = resolveRes.headers.get('content-type') || '';
    if (resolveRes.ok && contentType.includes('application/json')) {
      const data = await resolveRes.json();

      // Somente bloqueia se for explicitamente INATIVO (suspenso)
      if (data && data.reason === 'inactive') {
        const errorUrl = request.nextUrl.clone();
        errorUrl.pathname = '/tenant-error';
        errorUrl.searchParams.set('subdomain', subdomain);
        errorUrl.searchParams.set('reason', 'inactive');
        if (data.message) {
          errorUrl.searchParams.set('message', data.message);
        }
        return NextResponse.rewrite(errorUrl);
      }
    }

    // Cliente ativo ou em fallback resiliente
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-tenant-id', subdomain);
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
  } catch (err) {
    console.warn('Resolução de tenant pelo middleware em contingência:', err);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-subdomain', subdomain);
    requestHeaders.set('x-is-admin-domain', 'false');
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
