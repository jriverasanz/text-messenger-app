// Service Worker for WebPhone PWA
const CACHE_NAME = 'webphone-v2';
const RUNTIME_CACHE = 'webphone-runtime-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// API endpoints that should not be cached
const API_PATTERNS = [
  /api\.ringlogix\.com/,
  /\/api\//,
  /\/pbx\//
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Skip waiting to activate new service worker immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // Take control of all pages
      return self.clients.claim();
    })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Don't cache API requests
  if (API_PATTERNS.some(pattern => pattern.test(url.href))) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return offline fallback for API requests
        return new Response(
          JSON.stringify({ error: 'Offline - API requests unavailable' }),
          { 
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // Handle navigation requests (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(response => {
        return response || fetch(request);
      })
    );
    return;
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache successful responses
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          // Return a fallback response for failed requests
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          
          // Return offline fallback for images
          if (request.destination === 'image') {
            return new Response(
              '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#999">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-call-history') {
    event.waitUntil(syncCallHistory());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  } else if (event.tag === 'sync-contacts') {
    event.waitUntil(syncContacts());
  }
});

// Push notifications for incoming calls and messages
self.addEventListener('push', (event) => {
  let pushData;
  try {
    pushData = event.data.json();
  } catch (e) {
    pushData = { type: 'generic', message: event.data ? event.data.text() : 'New notification' };
  }

  const options = {
    body: pushData.message || 'New notification',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9InVybCgjZ3JhZGllbnQwXzBfMSkiLz4KPHBhdGggZD0iTTEyMCA4MEg3MkM2Ny41ODU4IDgwIDY0IDgzLjU4NTggNjQgODhWMTA0QzY0IDEwOC40MTQgNjcuNTg1OCAxMTIgNzIgMTEySDEyMEMxMjQuNDE0IDExMiAxMjggMTA4LjQxNCAxMjggMTA0Vjg4QzEyOCA4My41ODU4IDEyNC40MTQgODAgMTIwIDgwWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTk2IDY0QzEwMC40MTQgNjQgMTA0IDY3LjU4NTggMTA0IDcyVjg4QzEwNCA5Mi40MTQyIDEwMC40MTQgOTYgOTYgOTZIODhDODMuNTg1OCA5NiA4MCA5Mi40MTQyIDgwIDg4VjcyQzgwIDY3LjU4NTggODMuNTg1OCA2NCA4OCA2NEg5NloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik04OCAxMjhIMTA0QzEwOC40MTQgMTI4IDExMiAxMzEuNTg2IDExMiAxMzZWMTREMTEyIDE0OC40MTQgMTA4LjQxNCAxNTIgMTA0IDE1Mkg4OEM4My41ODU4IDE1MiA4MCAxNDguNDE0IDgwIDE0NFYxMzZDODAgMTMxLjU4NiA4My41ODU4IDEyOCA4OCAxMjhaIiBmaWxsPSJ3aGl0ZSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJncmFkaWVudDBfMF8xIiB4MT0iMCIgeTE9IjAiIHgyPSIxOTIiIHkyPSIxOTIiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iIzAwODRmZiIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMDUxZDUiLz4KPC9saW5lYXJHcmFkaWVudD4KPC9kZWZzPgo8L3N2Zz4=',
    badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDgiIGN5PSI0OCIgcj0iNDgiIGZpbGw9IiMwMDg0ZmYiLz4KPHBhdGggZD0iTTYwIDQ4SDM2QzMzLjYyNyA0OCAzMCA1MS42MjcgMzAgNTVWNjFDMzAgNjQuMzczIDMzLjYyNyA2OCAzNiA2OEg2MEM2My4zNzMgNjggNjcgNjQuMzczIDY3IDYxVjU1QzY3IDUxLjYyNyA2My4zNzMgNDggNjAgNDhaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=',
    vibrate: [200, 100, 200],
    data: {
      type: pushData.type || 'generic',
      dateOfArrival: Date.now(),
      primaryKey: pushData.id || 1,
      ...pushData
    },
    requireInteraction: pushData.type === 'call',
    silent: false
  };

  // Add actions based on notification type
  if (pushData.type === 'call') {
    options.actions = [
      {
        action: 'answer',
        title: 'Answer',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDQuNEg0QzMuNDQ3NzIgNC40IDMgNC44NDc3MiAzIDUuNFYxOC42QzMgMTkuMTUyMyAzLjQ0NzcyIDE5LjYgNCAxOS42SDIwQzIwLjU1MjMgMTkuNiAyMSAxOS4xNTIzIDIxIDE4LjZWNS40QzIxIDQuODQ3NzIgMjAuNTUyMyA0LjQgMjAgNC40Wk0xMiA5LjZDMTAuMjQwNyA5LjYgOC44IDExLjA0MDcgOC44IDEyLjhDMTAgMTQuNTU5MyAxMS40NDA3IDE2IDEzLjIgMTZIMTQuOEMxNi41NTkzIDE2IDE4IDE0LjU1OTMgMTggMTIuOEMxOCAxMS4wNDA3IDE2LjU1OTMgOS42IDE0LjggOS42SDEyWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+'
      },
      {
        action: 'decline',
        title: 'Decline',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTUuNCA5LjZMMTQuNCAxOC42TDE4LjYgMTQuNEw5LjYgNS40TDUuNCA5LjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4='
      }
    ];
  } else if (pushData.type === 'message') {
    options.actions = [
      {
        action: 'reply',
        title: 'Reply',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDJINFYxOEgyMFYyWk0xMCAxNEM4LjkgMTQgOCAxMy4xIDggMTJWMTBIMTZWMTJDMTYgMTMuMSAxNS4xIDE0IDE0IDE0SDEwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+'
      },
      {
        action: 'view',
        title: 'View',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDRDNyA0IDIuMDMgNy4wMyAyLjAzIDEyQzIuMDMgMTYuOTcgNyAyMCAxMiAyMEMxNyAyMCAyMS45NyAxNi45NyAyMS45NyAxMkMyMS45NyA3LjAzIDE3IDQgMTIgNFpNMTIgMThDMTAuMzQzIDE4IDkgMTYuNjU3IDkgMTVWMTNIMTNWMTVDMTMgMTYuNjU3IDExLjY1NyAxOCAxMiAxOFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg=='
      }
    ];
  }

  event.waitUntil(
    self.registration.showNotification('WebPhone', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};

  if (event.action === 'answer') {
    // Open the app and answer the call
    event.waitUntil(
      clients.openWindow(`/?action=answer-call&callId=${notificationData.callId || ''}`)
    );
  } else if (event.action === 'decline') {
    // Decline the call
    event.waitUntil(
      clients.openWindow(`/?action=decline-call&callId=${notificationData.callId || ''}`)
    );
  } else if (event.action === 'reply') {
    // Open messages to reply
    event.waitUntil(
      clients.openWindow(`/?action=reply-message&contact=${notificationData.contact || ''}`)
    );
  } else if (event.action === 'view') {
    // View the message
    event.waitUntil(
      clients.openWindow(`/?action=view-message&messageId=${notificationData.messageId || ''}`)
    );
  } else {
    // Just open the app with relevant context
    const url = notificationData.type === 'call' 
      ? `/?action=call-history`
      : notificationData.type === 'message'
      ? `/?action=messages`
      : '/';
    
    event.waitUntil(
      clients.matchAll().then(clientList => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        return clients.openWindow(url);
      })
    );
  }
});

// Periodic background sync for messages
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-messages-periodic') {
    event.waitUntil(syncMessages());
  }
});

// Sync functions for offline actions
function syncCallHistory() {
  return new Promise((resolve) => {
    // Implementation for syncing call history with server
    console.log('Syncing call history...');
    resolve();
  });
}

function syncMessages() {
  return new Promise((resolve) => {
    // Implementation for syncing messages with RingLogix API
    console.log('Syncing messages...');
    resolve();
  });
}

function syncContacts() {
  return new Promise((resolve) => {
    // Implementation for syncing contacts
    console.log('Syncing contacts...');
    resolve();
  });
}

// Handle message events from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Network status monitoring
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Trigger background sync when coming back online
  self.registration.sync.register('sync-messages');
  self.registration.sync.register('sync-contacts');
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
});
