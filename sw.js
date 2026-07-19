// SERVICE WORKER - Ankore Offline Support
// Caches static assets and provides offline fallback

const CACHE_NAME = 'ankore-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/offline.html',
    '/privacy.html',
    '/terms.html',
    // External assets
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
    // Skip waiting to activate immediately
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
    // Clean up old caches
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    
    // Claim all clients immediately
    event.waitUntil(self.clients.claim());
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip API calls (always go to network)
    if (request.url.includes('/api/')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Offline - API unavailable' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // Strategy: Network first, fallback to cache
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Clone the response before caching
                const responseClone = response.clone();
                
                // Cache successful responses
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(request, responseClone);
                    });
                
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // No cache either, return offline page for HTML requests
                        if (request.headers.get('accept')?.includes('text/html')) {
                            return caches.match(OFFLINE_URL);
                        }
                        
                        // For other resources, return a basic offline response
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ===== MESSAGE EVENT =====
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data === 'getVersion') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-conversations') {
        event.waitUntil(syncConversations());
    }
});

async function syncConversations() {
    // Sync local conversations to server when online
    // This is a placeholder for future implementation
    console.log('Background sync triggered');
}
