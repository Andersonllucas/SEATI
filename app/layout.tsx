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
    apple: '/apple-touch-icon.png',
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
