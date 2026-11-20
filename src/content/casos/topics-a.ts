import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'acortador-urls',
    title: 'Acortador de URLs',
    summary:
      'El clásico de calentamiento: codificación base62, generación de IDs, caché y redirecciones a escala.',
    minutes: 22,
    keywords: ['url shortener', 'bitly', 'tinyurl', 'base62', 'key generation service', '301 vs 302'],
    group: 'Clásicos',
    load: () => import('./acortador-urls.mdx'),
  },
  {
    slug: 'rate-limiter',
    title: 'Rate limiter distribuido',
    summary:
      'Token bucket, sliding window y cómo coordinar límites entre muchos servidores con Redis.',
    minutes: 20,
    keywords: ['rate limiting', 'token bucket', 'sliding window', 'redis lua', '429', 'throttling'],
    group: 'Clásicos',
    load: () => import('./rate-limiter.mdx'),
  },
  {
    slug: 'twitter',
    title: 'Twitter / X: el timeline',
    summary:
      'Fan-out en escritura vs lectura, el problema de las celebridades y la arquitectura del home timeline.',
    minutes: 20,
    keywords: ['news feed', 'home timeline', 'fan-out', 'fanout on write', 'snowflake id', 'celebrity problem'],
    group: 'Redes sociales',
    load: () => import('./twitter.mdx'),
  },
  {
    slug: 'tiktok',
    title: 'TikTok: feed de video corto',
    summary:
      'Subida y transcodificación de video, CDN, y el sistema de recomendación que arma el feed Para ti.',
    minutes: 21,
    keywords: ['short video', 'for you feed', 'recommendation system', 'candidate generation', 'ranking', 'monolith'],
    group: 'Redes sociales',
    load: () => import('./tiktok.mdx'),
  },
  {
    slug: 'whatsapp',
    title: 'WhatsApp: chat en tiempo real',
    summary:
      'Conexiones persistentes, entrega de mensajes, estados de lectura, grupos y presencia.',
    minutes: 21,
    keywords: ['chat system', 'messaging', 'websocket', 'delivery receipts', 'signal protocol', 'presence'],
    group: 'Redes sociales',
    load: () => import('./whatsapp.mdx'),
  },
  {
    slug: 'youtube',
    title: 'YouTube: streaming de video',
    summary:
      'Pipeline de transcodificación, streaming adaptativo (HLS/DASH), CDN y conteo de vistas.',
    minutes: 21,
    keywords: ['video streaming', 'transcoding', 'hls', 'dash', 'adaptive bitrate', 'cdn', 'view count'],
    group: 'Medios',
    load: () => import('./youtube.mdx'),
  },
  {
    slug: 'instagram',
    title: 'Instagram: fotos y feed',
    summary:
      'Subida de imágenes, almacenamiento de objetos, feed, likes a escala e historias que expiran.',
    minutes: 21,
    keywords: ['photo sharing', 'news feed', 'stories', 'ttl', 'like counter', 'haystack', 'blob storage'],
    group: 'Medios',
    load: () => import('./instagram.mdx'),
  },
]
