import type { MetadataRoute } from 'next';

// PWA. Iconos pendientes (se añaden como app/icon-192.png / icon-512.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Productividad',
    short_name: 'Productividad',
    description: 'Sistema personal de productividad y finanzas',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d10',
    theme_color: '#0d0d10',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    // Entrada "desde fuera de la app": manteniendo presionado el ícono en la pantalla
    // de inicio aparece "Hablar con Aura", que abre directo con el orbe escuchando.
    shortcuts: [
      {
        name: 'Hablar con Aura',
        short_name: 'Aura',
        description: 'Abrir el asistente de voz escuchando',
        url: '/hoy?voz=1',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    ],
  };
}
