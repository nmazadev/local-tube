// LocalTube's service worker: what makes it installable as an app. It doesn't cache
// anything (videos and the API always come from the server); when the server can't be
// reached, pages get a short explanation instead of the browser's error screen.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const OFFLINE = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LocalTube</title>
<body style="font: 18px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; padding: 24px; box-sizing: border-box; text-align: center">
  <div>
    <h1 style="font-size: 22px">Can’t reach LocalTube</h1>
    <p>Check that the computer running it is on, and that you’re on the same Wi-Fi.</p>
    <button onclick="location.reload()" style="font: inherit; padding: 8px 20px">Try again</button>
  </div>
</body>`

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  )
})
