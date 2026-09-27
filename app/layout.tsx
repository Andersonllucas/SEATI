import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Outfit, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { TenantProvider } from '@/context/TenantContext';
import { AuthProvider } from '@/context/AuthContext';
import { CampaignProvider } from '@/context/CampaignContext';
import { ToastProvider } from '@/context/ToastContext';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-display',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const viewport: Viewport = {
  themeColor: '#0a3254',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SCE - ADTI',
  description: 'Sistema de Gestão Eleitoral e Articulação Política - Gestão de Eleitores, Lideranças e Sub-lideranças',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SCE - ADTI',
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
    <html lang="pt-BR" className={`${plusJakartaSans.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
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
