import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { TenantProvider } from '@/context/TenantContext';
import { AuthProvider } from '@/context/AuthContext';
import { CampaignProvider } from '@/context/CampaignContext';
import { ToastProvider } from '@/context/ToastContext';

export const viewport: Viewport = {
  themeColor: '#0a3254',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SEATI',
  description: 'Sistema de Gestão Eleitoral e Articulação Política - Gestão de Eleitores, Lideranças e Sub-lideranças',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SEATI',
  },
  icons: {
    icon: [
      { url: '/logo.webp?v=5', type: 'image/webp' },
      { url: '/icon-192.png?v=5', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-icon?size=32&v=5', sizes: '32x32', type: 'image/png' },
      { url: '/pwa-icon?size=192&v=5', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/logo.webp?v=5',
    apple: [
      { url: '/apple-touch-icon.png?v=5', sizes: '180x180', type: 'image/png' },
      { url: '/logo.webp?v=5', sizes: '180x180', type: 'image/webp' },
    ],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const isAdminDomain = headersList.get('x-is-admin-domain') === 'true';
  const tenantSubdomain = headersList.get('x-tenant-subdomain') || undefined;

  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning className="bg-background text-on-surface font-sans antialiased selection:bg-secondary selection:text-on-primary">
        <TenantProvider initialIsAdminMaster={isAdminDomain} initialSubdomain={tenantSubdomain}>
          <AuthProvider>
            <ToastProvider>
              <CampaignProvider>
                <AppShell>
                  {children}
                </AppShell>
              </CampaignProvider>
            </ToastProvider>
          </AuthProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
