// Service Worker for EduRise PWA & Breacher Web Push Notifications
const CACHE_NAME = 'edurise-pwa-v3';
const DEFAULT_UID = 'U6op8Nr462Z46tBgxa2COUnja5z1';
const DEFAULT_REPO = 'my-app';
const WORKER_BASE = 'https://storage.breacher.name.ng';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/dashboard',
  '/dashboard.html',
  '/learn',
  '/learn.html',
  '/classroom',
  '/classroom.html',
  '/classroom/chat',
  '/classroom/chat.html',
  '/profile',
  '/profile.html',
  '/auth',
  '/auth.html',
  '/checkout',
  '/checkout.html',
  '/courses/create',
  '/courses/create.html',
  '/courses/view',
  '/courses/view.html',
  '/manifest.json',
  '/pwa.css',
  '/pwa.js',
  '/404.html'
];

// Helper: read stored user config from Cache Storage
async function getStoredConfig() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match('/__breacher_user_config__');
    if (res) {
      return await res.json();
    }
  } catch (e) {
    console.warn('SW: Failed to read stored config from cache', e);
  }
  return null;
}

// Helper: store user config in Cache Storage
async function setStoredConfig(config) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      '/__breacher_user_config__',
      new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (e) {
    console.warn('SW: Failed to store config in cache', e);
  }
}

// Install: Precache core app routes & assets gracefully
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          // Non-critical if specific static alias isn't present during build
        }
      }
    })
  );
});

// Activate: Clean up any older cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Handle messages from active client tabs
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'SET_USER') {
    const { userId, uid, repo } = event.data;
    event.waitUntil(
      setStoredConfig({
        userId,
        uid: uid || DEFAULT_UID,
        repo: repo || DEFAULT_REPO,
        updatedAt: Date.now()
      })
    );
  }
});

// PUSH EVENT HANDLER (Breacher Zero-Infrastructure Payload-Free Web Push)
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const config = await getStoredConfig();
        const uid = config?.uid || DEFAULT_UID;
        const repo = config?.repo || DEFAULT_REPO;
        const userId = config?.userId;

        if (!userId) {
          console.warn('SW: Push received but no stored userId found in SW cache.');
          return;
        }

        // Fetch latest pending payloads from Breacher queue
        const fetchUrl = `${WORKER_BASE}/${uid}/${repo}/notify/latest?userId=${encodeURIComponent(userId)}`;
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          console.warn('SW: Failed to fetch notify/latest, status:', res.status);
          return;
        }

        const data = await res.json();
        const notifications = data.notifications || [];

        for (const msg of notifications) {
          // If message is marked silent or push-to-sync
          if (msg.silent) {
            // Forward payload to all open windows
            const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of windowClients) {
              client.postMessage({
                type: 'SILENT_SYNC_RECEIVED',
                notification: msg
              });
            }
            continue;
          }

          // Visual notification
          const title = msg.title || `Notification from ${msg.senderName || 'EduRise'}`;
          const options = {
            body: msg.body || 'You have a new update in EduRise.',
            icon: msg.icon || 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
            badge: msg.badge || 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
            tag: msg.tag || `edurise-notify-${msg.senderId || Date.now()}`,
            vibrate: msg.vibrate || [200, 100, 200],
            data: {
              url: msg.deepLinkUrl || '/classroom',
              senderId: msg.senderId,
              senderName: msg.senderName,
              timestamp: Date.now(),
              metadata: msg.metadata
            },
            actions: [
              { action: 'open', title: 'Open View' }
            ]
          };

          await self.registration.showNotification(title, options);

          // Also notify any open browser windows so the UI can refresh immediately
          const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of windowClients) {
            client.postMessage({
              type: 'NEW_MESSAGE_NOTIFICATION',
              notification: msg
            });
          }
        }
      } catch (err) {
        console.error('SW push event error:', err);
      }
    })()
  );
});

// NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/classroom';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Fetch: Comprehensive offline handling
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never interfere with API requests or non-GET requests
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin.includes('storage.breacher.name.ng')) {
    return;
  }

  // 1. Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;

          const cleanPath = url.pathname.replace(/\/$/, '');
          const htmlMatch = await caches.match(cleanPath + '.html');
          if (htmlMatch) return htmlMatch;

          const indexMatch = await caches.match(cleanPath + '/index.html');
          if (indexMatch) return indexMatch;

          const rootFallback =
            (await caches.match('/classroom.html')) ||
            (await caches.match('/dashboard.html')) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          return (
            rootFallback ||
            new Response('Offline: Page not cached yet.', {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            })
          );
        })
    );
    return;
  }

  // 2. Static assets
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
      })
    );
    return;
  }

  // 3. All other requests
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => cached)
      );
    })
  );
});
