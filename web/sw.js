// Service worker: makes each salon installable as its own app. Web Push handlers
// will live here; requests go straight to the network for now.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
