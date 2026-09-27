import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'SEATI',
    short_name: 'SEATI',
    description: 'Sistema de Gestão Eleitoral e Articulação Política',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc', // bg-background (approx slate-50)
    theme_color: '#0a3254',      // bg-primary
    icons: [
      {
        src: '/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
