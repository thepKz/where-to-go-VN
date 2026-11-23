// Đăng ký service worker. Chỉ chạy ở bản dựng, không chạy khi npm run dev.
const script = '/service-worker.js'
const reloadMarker = 'di-dau-sw-reload'

export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const worker = navigator.serviceWorker
  const hadController = !!worker.controller
  let reloaded = false
  let waitingForBlur = false
  let currentVersion: string | null = null
  let reloadedInSession = false
  try {
    reloadedInSession = sessionStorage.getItem(reloadMarker) === '1'
    if (reloadedInSession) sessionStorage.removeItem(reloadMarker)
  } catch {}
  const editing = () => {
    const element = document.activeElement
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable)
  }
  const reload = () => {
    if (reloaded || reloadedInSession) return
    if (editing()) { waitingForBlur = true; return }
    reloaded = true
    try { sessionStorage.setItem(reloadMarker, '1') } catch {}
    location.reload()
  }
  worker.addEventListener('controllerchange', () => { if (hadController) reload() })
  const noteVersion = (version: unknown) => {
    if (typeof version !== 'string') return
    const changed = currentVersion !== null && currentVersion !== version
    currentVersion = version
    if (changed) reload()
  }
  worker.addEventListener('message', event => {
    if (event.data?.type === 'di-dau-ban-moi' || event.data?.type === 'di-dau-phien-ban') noteVersion(event.data.version)
  })
  addEventListener('blur', () => { if (waitingForBlur) setTimeout(() => { if (!editing()) { waitingForBlur = false; reload() } }, 0) }, true)
  const start = () => {
    void (async () => {
      // Bản cũ đăng ký ở đường dẫn khác thì gỡ để không kẹt chiến lược cũ.
      for (const old of await worker.getRegistrations()) {
        const url = (old.active || old.waiting || old.installing)?.scriptURL || ''
        if (!url.endsWith(script)) await old.unregister()
      }
      const registration = await worker.register(script, { updateViaCache: 'none' })
      const readVersion = (active: ServiceWorker | null) => new Promise<string | null>(resolve => {
        if (!active) { resolve(null); return }
        const channel = new MessageChannel()
        const timer = setTimeout(() => { channel.port1.close(); resolve(null) }, 1000)
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(typeof event.data?.version === 'string' ? event.data.version : null) }
        active.postMessage('lay-phien-ban', [channel.port2])
      })
      currentVersion = await readVersion(registration.active)
      const activateWaiting = () => registration.waiting?.postMessage('dung-ban-moi')
      activateWaiting()
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        installing?.addEventListener('statechange', () => { if (installing.state === 'installed') activateWaiting() })
      })
      const check = () => {
        void registration.update().then(() => {
          activateWaiting()
          void readVersion(registration.active).then(version => { if (version) noteVersion(version) })
        }).catch(() => {})
      }
      check()
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      addEventListener('pageshow', check)
      addEventListener('focus', check)
    })().catch(() => {})
  }
  if (document.readyState === 'complete') start()
  else addEventListener('load', start)
}
