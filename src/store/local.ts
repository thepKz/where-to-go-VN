import type { Identity, Tables, Change } from './types'
import type { Transport, Session } from './transport'
import { copy } from '../copy'
export class LocalTransport implements Transport {
  private identity!: Identity
  private cursor = 0
  // Chế độ nhà (npm run nha) dựng trang với VITE_SYNC_URL=cung-goc: gọi đồng bộ theo đường dẫn cùng gốc với trang.
  constructor(private url = import.meta.env.VITE_SYNC_URL === 'cung-goc' ? '' : import.meta.env.VITE_SYNC_URL || 'http://localhost:4504') {}
  private async request(path: string, body: unknown) {
    const response = await fetch(this.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.identity?.token || ''}`, 'X-Member-Id': this.identity?.memberId || '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(response.status === 404 ? copy.errors.code : response.status === 409 ? copy.errors.houseFull : response.status === 429 ? copy.errors.tooMany : copy.errors.connection)
    return response.json()
  }
  async bootstrap(session: Session) { this.identity = session.identity; const result = await this.request('/session', session); this.identity = result.identity; return result }
  async join(code: string, name: string) { const result = await this.request('/join', { code, name }); this.identity = result.identity; this.cursor = 0; return result }
  async create(name: string) { const result = await this.request('/house', { name }); this.identity = result.identity; this.cursor = 0; return result }
  async removeMember(memberId: string) { return (await this.request('/remove', { target: memberId })).tables as Tables }
  async write(change: Change) { return (await this.request('/change', change)).tables as Tables }
  listen(receive: (tables: Tables) => void, status: (online: boolean) => void, removed?: () => void) {
    const query = new URLSearchParams({ member: this.identity.memberId, token: this.identity.token, after: String(this.cursor) })
    const stream = new EventSource(`${this.url}/events?${query}`)
    stream.onopen = () => status(navigator.onLine)
    stream.onerror = () => status(false)
    stream.onmessage = event => { const message = JSON.parse(event.data); this.cursor = Number(event.lastEventId); receive(message.tables); status(navigator.onLine) }
    stream.addEventListener('removed', () => { stream.close(); removed?.() })
    let stopped = false
    const offline = () => status(false)
    const check = async () => {
      if (!navigator.onLine) { status(false); return }
      try { const response = await fetch(this.url + '/health', { signal: AbortSignal.timeout(1200) }); if (!stopped) status(response.ok) }
      catch { if (!stopped) status(false) }
    }
    const timer = setInterval(() => void check(), 1500)
    addEventListener('offline', offline); addEventListener('online', check)
    return () => { stopped = true; clearInterval(timer); removeEventListener('offline', offline); removeEventListener('online', check); stream.close() }
  }
}
