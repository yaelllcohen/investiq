const CACHE_NAME = 'investiq-v1'

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

// Install: pre-cache shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  )
  self.skipWaiting()
})

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch strategy:
//  - API routes → network only (always fresh data)
//  - Navigation → network first, fall back to cached '/' shell
//  - Static assets → cache first, update in background
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache API responses
  if (url.pathname.startsWith('/api/')) return

  // Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Update cache on successful nav
          const clone = response.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          return response
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match('/'))
        )
    )
    return
  }

  // Static assets: cache-first, network fallback + cache update
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return response
      })
      return cached || networkFetch
    })
  )
})
