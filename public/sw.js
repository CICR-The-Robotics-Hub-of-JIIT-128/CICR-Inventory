// CICR Inventory Hub - Service Worker for Native Device Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Focus the app window or open it when user taps the notification on their device panel
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        const host = (self.location && self.location.hostname ? self.location.hostname : '').toLowerCase();
        const target = /(^|\.)vercel\.app$/.test(host) ? 'https://inventory.cicr.in/' : '/';
        return self.clients.openWindow(target);
      }
    })
  );
});
