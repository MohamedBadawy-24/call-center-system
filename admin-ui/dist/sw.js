const CACHE_NAME = 'baseera-pwa-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/styles/index.css',
];

// Install Service Worker and Pre-cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate and Clean up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch Interception
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // We only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle API GET requests (Network-First with Cache fallback)
  if (requestUrl.pathname.startsWith('/api/')) {
    // Skip some endpoints like auth state checking or polling which shouldn't serve stale cache forever
    const isCacheableApi = 
      requestUrl.pathname.includes('/survey') ||
      requestUrl.pathname.includes('/surveys') ||
      requestUrl.pathname.includes('/agent/outbound-precall') ||
      requestUrl.pathname.includes('/settings/dailyGoal');

    if (isCacheableApi) {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            // Put clone into cache
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Fall back to cache
            return caches.match(event.request);
          })
      );
      return;
    }
  }

  // Standard static assets / routes (Network-First falling back to Cache)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache static assets dynamically
        const isStaticAsset = 
          response.status === 200 && 
          (requestUrl.pathname.endsWith('.js') || 
           requestUrl.pathname.endsWith('.css') || 
           requestUrl.pathname.endsWith('.png') || 
           requestUrl.pathname.endsWith('.svg') || 
           requestUrl.pathname.endsWith('.woff2') || 
           requestUrl.pathname.endsWith('.woff') ||
           requestUrl.pathname.endsWith('.html') ||
           requestUrl.pathname === '/');
        
        if (isStaticAsset) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Serve from cache or fallback to index.html for Single Page Application client routing
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a front-end route request fails, return cached index.html
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});
