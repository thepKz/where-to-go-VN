// Service worker của Đi Đâu, tự viết. Bản dựng điền số phiên bản và danh sách tệp đệm sẵn vào hai chỗ có dấu gạch dưới kép.
// Không chạy khi npm run dev. Không đệm sẵn ô bản đồ.
const VERSION = '__VERSION__'
const SHELL = 'di-dau-vo-' + VERSION
const DATA = 'di-dau-du-lieu'
const TILES = 'di-dau-o-ban-do'
const TILE_LIMIT = 800
const PRECACHE = __PRECACHE__
const KEEP = [SHELL, DATA, TILES]

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('di-dau-') && !KEEP.includes(key)) await caches.delete(key)
    await self.clients.claim()
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'di-dau-ban-moi', version: VERSION })
  })())
})

self.addEventListener('message', event => {
  if (event.data === 'dung-ban-moi') event.waitUntil(self.skipWaiting())
  else if (event.data === 'lay-phien-ban') event.ports[0]?.postMessage({ type: 'di-dau-phien-ban', version: VERSION })
})

const isTile = url => /^tile\.openstreetmap\.org$/.test(url.hostname)
const isData = url => /\/places(\.[a-z-]+)?\.json$/.test(url.pathname)

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (isTile(url)) return event.respondWith(tile(request))
  if (isData(url)) return event.respondWith(data(request))
  if (url.origin !== self.location.origin) return
  // Đường đồng bộ của chế độ nhà cùng gốc với trang: không bao giờ đệm, luồng sự kiện còn không đọc hết được.
  if (/^\/(health|session|events|join|house|remove|change)$/.test(url.pathname)) return
  if (request.mode === 'navigate') return event.respondWith(page(request))
  event.respondWith(asset(request))
})

async function page(request) {
  try {
    const response = await withTimeout(fetch(request), 4000)
    if (response.ok) { const cache = await caches.open(SHELL); cache.put('/index.html', response.clone()) }
    return response
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
  }
}

async function asset(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') { const cache = await caches.open(SHELL); cache.put(request, response.clone()) }
    return response
  } catch { return Response.error() }
}

async function data(request) {
  const cache = await caches.open(DATA)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) || (await caches.match(request, { ignoreSearch: true })) || Response.error()
  }
}

// Ô bản đồ: chỉ giữ ô người dùng đã xem, tối đa TILE_LIMIT ô, bỏ ô cũ nhất trước.
async function tile(request) {
  const cache = await caches.open(TILES)
  const cached = await cache.match(request.url)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok || response.type === 'opaque') {
      await cache.put(request.url, response.clone())
      const keys = await cache.keys()
      for (const key of keys.slice(0, Math.max(0, keys.length - TILE_LIMIT))) await cache.delete(key)
    }
    return response
  } catch { return Response.error() }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
