import { CITY_CENTERS, cityOfPoint, filterPlacesByCity, findRound, normalizeWhere, roundSeed, suggest, formatDate, eligiblePlaces } from '../core/index.mjs'
import { applyChange, emptyTables, remapChange } from './shared.mjs'
import { LocalTransport } from './local'
import { uuid } from './uuid'
import { copy } from '../copy'
import { SyncError, type Transport } from './transport'
import { syncText } from './messages'
import type { Catalog, Change, Group, Identity, Mark, PickMark, Place, Round, Snapshot, Store, Table, Tables, Verdict, Where } from './types'
export type * from './types'

const storageKey = `di-dau-store-v1-${import.meta.env.VITE_STORE || 'local'}`
const emptyCatalog: Catalog = { version: '', places: [], areas: [], dishes: [] }
const TRANSPORT_TIMEOUT = 15000
const NOTICE_MS = 10000
/** Hạn chờ cho một lời gọi máy chủ. 0 là không đặt hạn (bản local đã có hạn chờ riêng). */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  if (!ms) return work
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SyncError('timeout', 'temporary')), ms)
    work.then(value => { clearTimeout(timer); resolve(value) }, failure => { clearTimeout(timer); reject(failure) })
  })
}
export class AppStore implements Store {
  private listeners = new Set<() => void>()
  private pending: Change[] = []
  private state: Snapshot
  private transport: Transport
  private stop?: () => void
  private retry?: ReturnType<typeof setTimeout>
  private flushing = false
  private started = false
  private connected = false
  private disposed = false
  private connecting = false
  private attempts = 0
  private connectAttempts = 0
  private rejected = 0
  private notice?: ReturnType<typeof setTimeout>
  private setupShown = false
  private local = import.meta.env.VITE_STORE !== 'supabase'
  constructor() {
    let saved: { state?: Snapshot; pending?: Change[] } = {}
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch {}
    const stamp = new Date().toISOString()
    const identity = saved.state?.identity || { memberId: uuid(), householdId: uuid(), token: uuid() }
    this.state = saved.state || { ...emptyTables() as Tables, identity, catalog: emptyCatalog, ready: false, sync: 'syncing', error: null }
    if (identity.householdId && !this.state.households.length) this.state.households = [{ id: identity.householdId, invite_code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), created_at: stamp }]
    if (!this.state.members.length) this.state.members = [{ id: identity.memberId, household_id: identity.householdId, name: copy.deviceDefault, joined_at: stamp }]
    this.pending = saved.pending || []
    this.state = { ...this.state, ready: false, sync: 'syncing', error: null }
    this.transport = new LocalTransport()
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() {
    this.state = { ...this.state }
    try { localStorage.setItem(storageKey, JSON.stringify({ state: this.state, pending: this.pending })) }
    catch { this.state.error = copy.errors.full }
    this.listeners.forEach(listener => listener())
  }
  now() {
    const value = this.local ? new URLSearchParams(location.search).get('now') : null
    return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString()
  }
  seed() {
    const value = this.local ? new URLSearchParams(location.search).get('seed') : null
    return value !== null && Number.isFinite(Number(value)) ? Number(value) : undefined
  }
  getPlaces() { return [...this.state.catalog.places, ...this.state.custom_places] }
  getPlace(id: string) { return this.getPlaces().find(place => place.id === id) }
  async init() {
    if (this.started) return
    this.started = true
    if (!this.local) { const { SupabaseTransport } = await import('./supabase'); this.transport = new SupabaseTransport() }
    try {
      const response = await fetch(import.meta.env.VITE_DATA_URL || '/data/places.json', { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (!data || !Array.isArray(data.places) || !Array.isArray(data.areas) || !Array.isArray(data.dishes) || typeof data.version !== 'string' || data.places.some((place: Place) => !place.id || !place.name || !['an', 'ca-phe', 'nhau', 'choi'].includes(place.group))) throw new Error()
      this.state.catalog = data
    } catch { if (!this.state.catalog.places.length) this.state.error = copy.errors.data }
    this.state.ready = true
    this.emit()
    if (!this.local && typeof addEventListener === 'function') addEventListener('online', this.wake)
    await this.connect()
  }
  // Giãn cách thử lại: bản local giữ 1,5 giây, bản supabase tăng dần 1,5 rồi 3, 6, 12, 24, tối đa 30 giây.
  private delay(attempt: number) { return this.local ? 1500 : Math.min(30000, 1500 * 2 ** Math.max(0, attempt - 1)) }
  private call<T>(work: Promise<T>) { return withTimeout(work, this.local ? 0 : TRANSPORT_TIMEOUT) }
  private wake = () => {
    if (this.disposed) return
    this.attempts = 0; this.connectAttempts = 0
    clearTimeout(this.retry)
    if (this.connected) void this.flush(); else void this.connect()
  }
  private say(message: string) {
    this.state.error = message
    clearTimeout(this.notice)
    this.notice = setTimeout(() => { if (this.state.error === message) { this.state.error = null; this.emit() } }, NOTICE_MS)
  }
  // Máy đứng ngoài nhà (đã bị gỡ) thì không nhận bảng nào. Bảng từ máy chủ không còn dòng của máy này nghĩa là máy đã bị gỡ.
  private accept(tables: Tables) {
    const { memberId, householdId } = this.state.identity
    if (!householdId) return
    if (!tables.members.some(member => member.id === memberId)) { this.detach(); return }
    Object.assign(this.state, tables)
    for (const change of this.pending) applyChange(this.state, change)
    this.emit()
  }
  private async connect() {
    if (this.disposed || this.connecting) return
    this.connecting = true
    const before = this.state.identity
    try {
      const result = await this.call(this.transport.bootstrap({ identity: this.state.identity, household: this.state.households[0], member: this.state.members.find(member => member.id === this.state.identity.memberId)!, entered: this.state.entered, detached: !this.state.identity.householdId }))
      if (this.disposed) return
      if (!result.identity.householdId) {
        this.detach(result.identity)
        this.connected = true; this.connectAttempts = 0
        return
      }
      // Thay đổi chờ được ghi lúc máy chưa vào nhà mang mã tạm: đổi sang mã người dùng và mã nhà thật.
      this.pending = this.pending.map(change => remapChange(change, before, result.identity))
      this.state.identity = result.identity
      this.state.entered = true
      this.accept(result.tables)
      if (this.setupShown) { this.setupShown = false; this.state.error = null }
      this.connected = true
      this.connectAttempts = 0
      this.listen()
      await this.flush()
    } catch (failure) {
      this.connectAttempts += 1
      if (failure instanceof SyncError && failure.kind === 'setup') { this.setupShown = true; this.state.error = syncText.setup }
      this.state.sync = 'offline'; this.emit()
      if (!this.disposed) { clearTimeout(this.retry); this.retry = setTimeout(() => void this.connect(), this.delay(this.connectAttempts)) }
    } finally { this.connecting = false }
  }
  private listen() {
    this.stop?.()
    this.stop = this.transport.listen(tables => this.accept(tables), online => {
      this.state.sync = online ? this.pending.length ? 'syncing' : 'ok' : 'offline'
      this.emit()
      if (online) { this.attempts = 0; void this.flush() }
    }, () => this.detach())
  }
  // Máy bị gỡ khỏi nhà: bỏ hết dữ liệu của nhà cũ và các thay đổi chờ, giữ tên máy, trở về chưa vào nhà.
  private detach(identity: Identity = this.state.identity) {
    const me = this.state.members.find(member => member.id === identity.memberId)
    this.stop?.(); this.stop = undefined
    this.pending = []
    this.state = { ...this.state, ...(emptyTables() as Tables), identity: { ...identity, householdId: '' }, members: [{ id: identity.memberId, household_id: '', name: me?.name || copy.deviceDefault, joined_at: me?.joined_at || this.now() }], sync: 'ok', entered: true, error: null }
    this.emit()
  }
  // Một thay đổi bị luật từ chối thì bỏ khỏi hàng chờ, giữ các thay đổi sau, tải lại bảng để màn trở về đúng.
  private async drop(change: Change) {
    const index = this.pending.indexOf(change)
    if (index >= 0) this.pending.splice(index, 1)
    this.rejected += 1
    this.state.rejected = this.rejected
    this.say(syncText.rejected)
    try { const tables = await this.call(this.transport.reload ? this.transport.reload() : Promise.resolve(undefined)); if (tables) this.accept(tables) } catch {}
    this.emit()
  }
  // Hết phiên đăng nhập: nối lại từ đầu (đăng nhập ẩn danh lại nếu cần).
  private lose() {
    this.connected = false
    this.stop?.(); this.stop = undefined
    this.state.sync = 'offline'; this.emit()
    clearTimeout(this.retry)
    this.retry = setTimeout(() => void this.connect(), this.delay(1))
  }
  private async flush() {
    if (this.flushing || !this.connected || this.disposed) return
    if (!navigator.onLine) { this.state.sync = 'offline'; this.emit(); return }
    this.flushing = true
    let failed = false
    try {
      while (this.pending.length) {
        const change = this.pending[0]
        try {
          const tables = await this.call(this.transport.write(change))
          const index = this.pending.indexOf(change)
          if (index >= 0) this.pending.splice(index, 1)
          this.attempts = 0
          if (tables) this.accept(tables)
          this.emit()
        } catch (failure) {
          const kind = failure instanceof SyncError ? failure.kind : 'temporary'
          if (kind === 'permanent') { await this.drop(change); continue }
          if (kind === 'auth') { this.lose(); return }
          throw failure
        }
      }
      this.state.sync = 'ok'
    } catch { failed = true; this.state.sync = 'offline' }
    finally {
      this.flushing = false; this.emit()
      if (failed) this.attempts += 1
      if (this.pending.length && this.connected && !this.disposed) { clearTimeout(this.retry); this.retry = setTimeout(() => void this.flush(), this.delay(this.attempts)) }
    }
  }
  private async write(table: Table, row: unknown) {
    if (!this.state.identity.householdId) throw new Error(copy.errors.join)
    const change: Change = { id: uuid(), table, row }
    applyChange(this.state, change)
    this.pending.push(change)
    this.state.sync = this.state.sync === 'offline' ? 'offline' : 'syncing'
    this.emit()
    void this.flush()
  }
  async setName(name: string) {
    if (!name.trim() || name.length > 80) throw new Error(copy.errors.name)
    const member = this.state.members.find(row => row.id === this.state.identity.memberId)!
    if (!this.state.identity.householdId) { applyChange(this.state, { table: 'members', row: { ...member, name: name.trim() } }); this.emit(); return }
    await this.write('members', { ...member, name: name.trim() })
  }
  private async switchHouse(action: () => Promise<{ identity: Identity; tables: Tables }>) {
    await this.flush()
    if (this.pending.length) throw new Error(copy.errors.pending)
    const result = await action()
    this.stop?.()
    this.state.identity = result.identity
    this.state.entered = true
    this.accept(result.tables)
    this.listen()
  }
  async createHousehold() {
    const name = this.state.members.find(row => row.id === this.state.identity.memberId)?.name || copy.deviceDefault
    await this.switchHouse(() => this.transport.create(name))
  }
  async joinHousehold(code: string) {
    if (!/^[A-Za-z0-9]{6}$/.test(code.trim())) throw new Error(copy.errors.codeLength)
    const name = this.state.members.find(row => row.id === this.state.identity.memberId)?.name || copy.deviceDefault
    await this.switchHouse(() => this.transport.join(code.trim().toUpperCase(), name))
  }
  async removeMember(memberId: string) {
    if (!this.transport.removeMember || memberId === this.state.identity.memberId) throw new Error(syncText.removeFailed)
    try { this.accept(await this.call(this.transport.removeMember(memberId))) }
    catch { throw new Error(syncText.removeFailed) }
  }
  async updateMark(placeId: string, patch: Partial<PickMark>) {
    if (!this.getPlace(placeId)) throw new Error(copy.errors.missingPlace)
    if (patch.note && patch.note.length > 4000) throw new Error(copy.errors.note)
    const { memberId, householdId } = this.state.identity
    const existing = this.state.marks.find(row => row.place_id === placeId && row.member_id === memberId)
    const mark: Mark = { household_id: householdId, member_id: memberId, place_id: placeId, want: false, visited_at: null, verdict: null, note: '', ...existing, ...patch, updated_at: this.now() }
    await this.write('marks', mark)
  }
  async addCustomPlace(place: Place) {
    if (!place.name.trim() || !place.address.trim() || !['an', 'ca-phe', 'nhau', 'choi'].includes(place.group)) throw new Error(copy.errors.placeFields)
    if ([place.mapsUrl, ...place.sources.map(source => source.url)].some(value => { try { return !['http:', 'https:'].includes(new URL(value).protocol) } catch { return true } })) throw new Error(copy.errors.link)
    await this.write('custom_places', { ...place, id: place.id || uuid(), household_id: this.state.identity.householdId, added_by: this.state.identity.memberId })
  }
  async startRound(group: Group, where: Where, exclude: string[] = []) {
    const householdId = this.state.identity.householdId
    const options = { householdId, group, where, now: this.now() }
    // Tâm Hồ Gươm chỉ là điểm tìm kiếm tạm, không được ghi thành vị trí của lượt.
    const searchPoint = typeof where === 'string' ? CITY_CENTERS['ha-noi'] : where || CITY_CENTERS['ha-noi']
    const searchWhere = typeof where === 'string' ? where : searchPoint
    const area = typeof where === 'string' ? this.state.catalog.areas.find(item => item.id === where) : null
    const city = area?.city || (typeof where === 'string' ? 'ha-noi' : cityOfPoint(searchPoint, this.state.catalog.areas))
    const places = filterPlacesByCity(this.getPlaces(), city, this.state.catalog.areas)
    // Lượt chạy thật vẫn dùng chung lượt trong 30 phút; seed trên URL chỉ dành cho bộ kiểm và phải tạo đầu vào mới.
    const existing = findRound(this.state.rounds, options)
    const eligible = new Set(eligiblePlaces(places, { group, where: searchWhere, now: this.now(), marks: this.state.marks, picks: this.state.picks }).map(place => place.id))
    const usedByMe = existing && (this.state.picks.some(pick => pick.round_id === existing.id) || this.state.votes.some(vote => vote.round_id === existing.id && vote.member_id === this.state.identity.memberId))
    if (existing && !usedByMe && !exclude.some(id => existing.place_ids.includes(id)) && existing.place_ids.every(id => eligible.has(id))) return existing
    const seeded = this.seed() !== undefined
    const seed = roundSeed({ ...options, where: searchWhere, seed: this.seed(), iteration: exclude.length || existing || seeded ? this.state.rounds.filter(round => round.group === group).length : 0 })
    const result = suggest({ places, group, where: searchWhere, now: this.now(), marks: this.state.marks, picks: this.state.picks, exclude, seed })
    const round: Round = { id: `round-${householdId}-${seed}`, household_id: householdId, group, where: normalizeWhere(where), seed, place_ids: result.places.map(place => place.id), created_at: this.now() }
    await this.write('rounds', round)
    return round
  }
  async vote(roundId: string, placeId: string, like: boolean) {
    if (!this.state.rounds.find(round => round.id === roundId)?.place_ids.includes(placeId)) throw new Error(copy.errors.round)
    await this.write('votes', { round_id: roundId, place_id: placeId, member_id: this.state.identity.memberId, like, at: this.now() })
  }
  async pick(roundId: string, placeId: string) {
    if (!this.state.rounds.find(round => round.id === roundId)?.place_ids.includes(placeId)) throw new Error(copy.errors.round)
    await this.write('picks', { household_id: this.state.identity.householdId, round_id: roundId, place_id: placeId, picked_at: this.now(), asked_verdict: false, picked_by: this.state.identity.memberId })
  }
  async pickPlace(placeId: string) {
    const place = this.getPlace(placeId)
    if (!place) throw new Error(copy.errors.missingPlace)
    const householdId = this.state.identity.householdId
    const seed = roundSeed({ householdId, group: place.group, where: null, now: this.now(), seed: placeId, iteration: this.state.rounds.length })
    const round: Round = { id: `round-${householdId}-${seed}`, household_id: householdId, group: place.group, where: null, seed, place_ids: [placeId], created_at: this.now() }
    await this.write('rounds', round)
    await this.pick(round.id, placeId)
  }
  async answerPick(roundId: string, verdict?: Verdict) {
    const pick = this.state.picks.find(row => row.round_id === roundId)
    if (!pick) return
    if (verdict) await this.updateMark(pick.place_id, { visited_at: pick.picked_at, verdict })
    await this.write('picks', { ...pick, asked_verdict: true })
  }
  dispose() {
    this.disposed = true; this.stop?.(); clearTimeout(this.retry); clearTimeout(this.notice)
    if (typeof removeEventListener === 'function') removeEventListener('online', this.wake)
  }
}
export function yesterdayPick(store: Store) {
  const yesterday = formatDate(Date.parse(store.now()) - 86400000)
  return store.getSnapshot().picks.find(pick => !pick.asked_verdict && formatDate(pick.picked_at) === yesterday)
}
export const store: Store = new AppStore()
