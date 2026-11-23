export type Group = 'an' | 'ca-phe' | 'nhau' | 'choi'
export type City = 'ha-noi' | 'ho-chi-minh'
export type Point = { lat: number; lng: number }
export type Where = string | Point | null
export type Verdict = 'great' | 'ok' | 'never' | null
export interface Place {
  id: string; name: string; group: Group; kind: string; address: string; district: string
  city?: City
  areaId: string | null; lat: number | null; lng: number | null; geo: 'exact' | 'street' | 'area' | 'none'
  dishes: string[]; dishNotes: string[]; price: string | null
  hours: { days: number[]; open: string; close: string }[] | null; hoursText: string | null
  why: string | null; sources: { url: string; site: string; kind: string; says: string; checked: string; verified: string }[]
  hot?: { rank: number; since: string; sources: { url: string; site: string; date: string }[] }
  mapsUrl: string; trust: number; badges: string[]; status: string; updated: string
  cuisine?: string[]; priceMin?: number | null; priceMax?: number | null; priceUnit?: 'nguoi' | 'mon' | 've' | 'gio' | null
  menu?: { name: string; price: number | null; source?: string }[]; menuUrl?: string | null; floor?: string | null; unit?: string | null
  household_id?: string; added_by?: string
}
export interface Area {
  id: string; name: string; kind: string; district: string; lat: number; lng: number
  city?: City
  type?: 'mall' | 'pho-an' | 'khu'; address?: string | null; hoursText?: string | null
  hours?: { days: number[]; open: string; close: string }[] | null; floors?: string[]; sources?: Place['sources']; updated?: string | null
  counts?: Partial<Record<Group, number>>
}
export interface Dish { id: string; name: string; blurb: string }
export interface Catalog { version: string; sample?: boolean; places: Place[]; areas: Area[]; dishes: Dish[]; cuisines?: { id: string; name: string }[] }
export interface Household { id: string; invite_code: string; created_at: string }
export interface Member { id: string; household_id: string; name: string; joined_at: string; seen_at?: string }
export interface Mark { household_id: string; place_id: string; member_id: string; want: boolean; visited_at: string | null; verdict: Verdict; note: string; updated_at: string }
export interface Round { id: string; household_id: string; group: Group; where: Where; seed: number; place_ids: string[]; created_at: string }
export interface Vote { round_id: string; household_id?: string; member_id: string; place_id: string; like: boolean; at: string }
export interface Pick { household_id: string; place_id: string; round_id: string; picked_at: string; asked_verdict: boolean; /** Mã máy đã chốt. Lượt chốt cũ có thể không có. */ picked_by?: string }
export interface Tables { households: Household[]; members: Member[]; marks: Mark[]; custom_places: Place[]; rounds: Round[]; votes: Vote[]; picks: Pick[] }
export type Table = keyof Tables
export interface Change { id: string; table: Table; row: any }
export interface Identity { memberId: string; token: string; householdId: string }
export interface Snapshot extends Tables { catalog: Catalog; identity: Identity; sync: 'ok' | 'offline' | 'syncing'; ready: boolean; error: string | null
  /** Số thay đổi bị máy chủ từ chối và đã bỏ khỏi hàng chờ từ lúc mở ứng dụng. */
  rejected?: number
  /** Máy này đã từng vào một nhà thật (khác nhà tạm lúc mở lần đầu). */
  entered?: boolean }
export interface Store {
  init(): Promise<void>; dispose(): void; getSnapshot(): Snapshot; subscribe(listener: () => void): () => void
  now(): string; seed(): number | undefined; getPlaces(): Place[]; getPlace(id: string): Place | undefined
  setName(name: string): Promise<void>; createHousehold(): Promise<void>; joinHousehold(code: string): Promise<void>
  /** Gỡ một máy cùng nhà khỏi nhà (không gỡ chính mình). Chỉ bản supabase hỗ trợ. */
  removeMember(memberId: string): Promise<void>
  updateMark(placeId: string, patch: Partial<PickMark>): Promise<void>; addCustomPlace(place: Place): Promise<void>
  startRound(group: Group, where: Where, exclude?: string[]): Promise<Round>; vote(roundId: string, placeId: string, like: boolean): Promise<void>
  pick(roundId: string, placeId: string): Promise<void>
  /** Chốt một chỗ mà không qua lượt gợi ý (từ chi tiết): tạo lượt một chỗ rồi chốt trong lượt đó. */
  pickPlace(placeId: string): Promise<void>; answerPick(roundId: string, verdict?: Verdict): Promise<void>
}
export type PickMark = { want: boolean; visited_at: string | null; verdict: Verdict; note: string }
