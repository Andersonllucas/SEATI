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
    background_color: '#f8fafc',
    theme_color: '#0a3254',
    icons: [
      {
        src: '/icon-192.png?v=5',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=5',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=5',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logo.webp?v=5',
        sizes: 'any',
        type: 'image/webp',
        purpose: 'any',
      },
      {
        src: '/logo.png?v=5',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
