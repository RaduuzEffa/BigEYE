const CACHE_NAME = 'bigeye-cache-v10';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/recorder.js',
    './BigEYE.png',
    './manifest.json',
    './icon-192x192.png',
    './icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap',
    'https://unpkg.com/@phosphor-icons/web'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (e) => {
    // Přeskočit požadavky rozšíření apod.
    if (!e.request.url.startsWith('http')) return;

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(e.request).then((networkResponse) => {
                // Dynamicky uložit do mezipaměti to, co ještě není (např. fonty, ikony z CDN)
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseToCache);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Fallback pro navigaci
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});

self.addEventListener('activate', (e) => {
    const cacheWhitelist = [CACHE_NAME];
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
