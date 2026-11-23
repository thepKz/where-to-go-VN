import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { emptyTables, rowKey, tableNames } from './shared.mjs'
import type { Change, Identity, Table, Tables } from './types'
import { SyncError, type Session, type Transport } from './transport'
import { copy } from '../copy'
import { syncText } from './messages'

const PAGE = 1000
const REQUEST_TIMEOUT = 10000
const ROUND_DAYS = 90
const MEMBER_PROBE_MS = 10000
// Cột sắp xếp cho từng bảng: cần thứ tự cố định để chia trang không trùng, không sót.
const order: Record<Table, { column: string; ascending?: boolean }[]> = {
  households: [{ column: 'id' }],
  members: [{ column: 'id' }],
  marks: [{ column: 'place_id' }, { column: 'member_id' }],
  custom_places: [{ column: 'id' }],
  rounds: [{ column: 'created_at', ascending: false }, { column: 'id' }],
  votes: [{ column: 'round_id' }, { column: 'member_id' }, { column: 'place_id' }],
  picks: [{ column: 'round_id' }],
}
const conflict: Partial<Record<Table, string>> = { marks: 'household_id,place_id,member_id', votes: 'round_id,member_id,place_id', picks: 'household_id,round_id', custom_places: 'household_id,id' }

/** Yêu cầu mạng có hạn chờ. Không dùng AbortSignal.any để chạy được trên Safari cũ. */
export function fetchWithTimeout(ms: number, base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (input, init = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('timeout')), ms)
    const outer = init.signal
    if (outer) { if (outer.aborted) controller.abort(outer.reason); else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true }) }
    return base(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
  }
}

type Failure = { message?: string; code?: string; status?: number; name?: string }
/** Phân loại lỗi do supabase-js trả về thành lỗi tạm thời, vĩnh viễn, hết phiên hoặc chưa cài xong. */
export function classify(error: unknown, status?: number): SyncError {
  const failure = (error || {}) as Failure
  const message = String(failure.message || 'error')
  const code = typeof failure.code === 'string' && failure.code ? failure.code : undefined
  const http = typeof status === 'number' && status > 0 ? status : typeof failure.status === 'number' && failure.status > 0 ? failure.status : undefined
  const made = (kind: SyncError['kind']) => new SyncError(message, kind, code, http)
  if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(message) || /captcha/i.test(message)) return made('setup')
  if (http === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) return made('auth')
  if (code && !code.startsWith('PGRST')) {
    // Mã của PostgreSQL. Nhóm 08 (nối), 40 (xung đột giao dịch), 53 (hết tài nguyên), 57 (bị ngắt) là tạm thời.
    return made(/^(08|40|53|57)/.test(code) ? 'temporary' : 'permanent')
  }
  if (http !== undefined && http >= 400 && http < 500 && http !== 408 && http !== 429) return made('permanent')
  return made('temporary')
}

export class SupabaseTransport implements Transport {
  private client: SupabaseClient
  private identity!: Identity
  // Tăng mỗi lần một thay đổi được máy chủ nhận. Lượt tải bắt đầu trước đó có thể mang dữ liệu cũ nên bị bỏ.
  private writes = 0
  private refresh?: () => void
  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error(copy.errors.setup)
    this.client = createClient(url, key, { global: { fetch: fetchWithTimeout(REQUEST_TIMEOUT) } })
  }
  private async pages(table: Table, since: string): Promise<unknown[]> {
    const house = this.identity.householdId
    const rows = new Map<string, unknown>()
    let from = 0
    let total: number | null = null
    for (;;) {
      let query: any = this.client.from(table).select('*', from === 0 ? { count: 'exact' } : undefined)
      if (table === 'households') query = query.eq('id', house)
      else query = query.eq('household_id', house)
      if (table === 'rounds') query = query.gte('created_at', since)
      for (const { column, ascending } of order[table]) query = query.order(column, { ascending: ascending !== false })
      const { data, error, count, status } = await query.range(from, from + PAGE - 1)
      if (error) throw classify(error, status)
      if (from === 0 && typeof count === 'number') total = count
      const got: unknown[] = data || []
      for (const row of got) rows.set(rowKey(table, row), row)
      from += got.length
      if (!got.length || (total !== null ? from >= total : got.length < PAGE)) break
    }
    return [...rows.values()]
  }
  private async load(): Promise<Tables> {
    const tables = emptyTables() as Tables
    const since = new Date(Date.now() - ROUND_DAYS * 86400000).toISOString()
    for (const table of tableNames as Table[]) (tables[table] as unknown[]) = await this.pages(table, since)
    tables.votes = tables.votes.filter(vote => tables.rounds.some(round => round.id === vote.round_id))
    return tables
  }
  private async ensureSession() {
    const { data: { session } } = await this.client.auth.getSession()
    if (session) return session
    const { data, error } = await this.client.auth.signInAnonymously()
    if (error || !data.session) throw classify(error || new Error(copy.errors.join), (error as { status?: number } | null)?.status)
    return data.session
  }
  async bootstrap(session: Session, retry = true): Promise<{ identity: Identity; tables: Tables }> {
    const auth = await this.ensureSession()
    const { data: member, error, status } = await this.client.from('members').select('*').eq('id', auth.user.id).maybeSingle()
    if (error) throw classify(error, status)
    this.identity = { memberId: auth.user.id, token: '', householdId: member?.household_id || '' }
    if (member) {
      // Báo máy này còn dùng. Lỗi ở đây không làm hỏng việc vào nhà.
      await Promise.resolve(this.client.rpc('touch')).then(() => undefined, () => undefined)
      return { identity: this.identity, tables: await this.load() }
    }
    // Cùng người dùng từng ở trong một nhà mà nay không còn là người của nhà nào (đã bị gỡ): đứng ngoài, không tự tạo nhà thay.
    // Người dùng ẩn danh mới (mất phiên cũ) thì vẫn tạo nhà như trước.
    if (session.detached || (session.entered && session.identity.memberId === auth.user.id)) return { identity: { memberId: auth.user.id, token: '', householdId: '' }, tables: emptyTables() as Tables }
    try { return await this.create(session.member.name) }
    catch (failure) {
      // Phiên còn lưu trên máy nhưng người dùng đã bị xoá phía máy chủ: bỏ phiên cũ, đăng nhập ẩn danh lại.
      if (retry && failure instanceof SyncError && failure.code === '23503') { await this.client.auth.signOut(); return this.bootstrap(session, false) }
      throw failure
    }
  }
  private async enter(functionName: string, args: Record<string, string>) {
    const { data, error, status } = await this.client.rpc(functionName, args)
    if (error) throw classify(error, status)
    if (!data) return null
    this.identity = { ...this.identity, householdId: data }
    return { identity: this.identity, tables: await this.load() }
  }
  async join(code: string, name: string) {
    let result
    try { result = await this.enter('join_household', { invite: code, member_name: name }) }
    catch (failure) {
      const text = failure instanceof Error ? failure.message : ''
      if (/Household full/i.test(text)) throw new Error(syncText.houseFull)
      if (/Too many attempts/i.test(text)) throw new Error(syncText.tooMany)
      throw new Error(failure instanceof SyncError && failure.kind === 'temporary' ? syncText.connection : syncText.join)
    }
    if (!result) throw new Error(syncText.wrongCode)
    return result
  }
  async create(name: string) {
    const result = await this.enter('create_household', { member_name: name })
    if (!result) throw new Error(copy.errors.join)
    return result
  }
  async write(change: Change) {
    const row = change.table === 'votes' ? { ...change.row, household_id: this.identity.householdId } : change.row
    const query = change.table === 'members'
      ? this.client.from('members').update({ name: row.name }).eq('id', this.identity.memberId)
      : this.client.from(change.table).upsert(row, { onConflict: conflict[change.table] || 'id', ignoreDuplicates: change.table === 'rounds' })
    const { error, status } = await query
    if (error) throw classify(error, status)
    this.writes += 1
    this.refresh?.()
  }
  async reload() { return this.load() }
  async removeMember(memberId: string) {
    const { error, status } = await this.client.rpc('remove_member', { target: memberId })
    if (error) throw classify(error, status)
    return this.load()
  }
  listen(receive: (tables: Tables) => void, status: (online: boolean) => void) {
    let stopped = false
    let loading = false
    let again = false
    const refresh = async () => {
      if (loading) { again = true; return }
      loading = true
      try {
        const mark = this.writes
        const tables = await this.load()
        if (stopped) return
        // Có thay đổi được nhận trong lúc tải: kết quả có thể thiếu thay đổi đó, tải lại thay vì ghi đè.
        if (this.writes !== mark) again = true
        else { receive(tables); status(true) }
      }
      catch { if (!stopped) status(false) }
      finally { loading = false; if (again && !stopped) { again = false; void refresh() } }
    }
    this.refresh = () => { if (!stopped) void refresh() }
    const channel = this.client.channel(`house-${this.identity.householdId}`)
    for (const table of tableNames) channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh())
    channel.subscribe(value => { if (stopped) return; status(value === 'SUBSCRIBED'); if (value === 'SUBSCRIBED') void refresh() })
    // Dự phòng cho trường hợp sự kiện gỡ người không tới: cứ mười giây hỏi một dòng nhỏ xem máy này còn là người của nhà không.
    // Không còn thì báo bảng trống, cửa hàng sẽ hiểu là máy đã bị gỡ.
    const probe = async () => {
      try {
        const { data, error } = await this.client.from('members').select('id').eq('id', this.identity.memberId).maybeSingle()
        if (!stopped && !error && !data) receive(emptyTables() as Tables)
      } catch {}
    }
    const timer = setInterval(() => void probe(), MEMBER_PROBE_MS)
    return () => { stopped = true; clearInterval(timer); if (this.refresh) this.refresh = undefined; void this.client.removeChannel(channel) }
  }
}
