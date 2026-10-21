/* سُبحة: works offline, updates itself when online, and shows reminders pushed to it. */
const VERSION = 'subha-v5';
const FONTS = 'subha-fonts';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Google Fonts, and the King Fahd Complex mushaf fonts for the al-Baqarah pages: keep a copy so they load offline */
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com' ||
      (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.indexOf('/npm/quran-qcf4@') === 0)) {
    event.respondWith(caches.open(FONTS).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  /* the version check always asks the site, never a saved copy */
  if (url.pathname.endsWith('/version.json')) return;

  /* the page itself: fresh when online (asking the server, so an update shows on the next open), the saved copy when offline */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

/* reminders sent from the reminder server */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'سُبحة', {
    body: data.body || 'حان وقت وردك',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'subha',
    lang: 'ar',
    dir: 'rtl',
    data: { url: data.url || './' }
  }));
});

/* tapping a reminder opens its dhikr or portion: an open app is told which one, otherwise the app opens on its link */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) {
        if (url !== './') client.postMessage({ type: 'subha-go', url });
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
