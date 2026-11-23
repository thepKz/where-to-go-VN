import { createContext, useCallback, useRef, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { store, type Group, type Point, type Where } from './store'
import { afterClear, canAskLocation, CITY_CENTERS, cityOfPoint, pickOrigin, readCityPreference, readStanding, readUsedAreas, rememberArea, rememberBefore, writeStanding } from './core/index.mjs'
import type { Standing } from './core/index'
import type { City } from './store'
import { copy } from './copy'
export function useStore() { return { store, state: useSyncExternalStore(store.subscribe, store.getSnapshot) } }
/** Tên người theo mã máy: tên máy đã đặt, chưa đặt thì Bạn cho máy này và Người kia cho máy khác. */
export function useNames() {
  const { state } = useStore()
  return (id: string) => {
    const name = state.members.find(member => member.id === id)?.name?.trim()
    if (name && name !== copy.deviceDefault) return name
    return id === state.identity.memberId ? copy.you : copy.other
  }
}
/** Tên một người trong nhà để hiện. Tên máy đã đặt là chữ người dùng gõ, chưa đặt thì Bạn hoặc Người kia. */
export function PersonName({ id }: { id: string }) {
  const { state } = useStore()
  const name = state.members.find(member => member.id === id)?.name?.trim()
  if (name && name !== copy.deviceDefault) return <span data-user-content>{name}</span>
  return <>{id === state.identity.memberId ? copy.you : copy.other}</>
}
interface AppContextValue {
  group: Group; setGroup: (group: Group) => void; where: Where; setWhere: (where: Where) => void
  /** Điểm dùng cho khoảng cách, Gần đây, bản đồ, Quay món: vị trí thật thắng, không có thì chỗ đứng đặt tay. */
  origin: Point | null; setOrigin: (origin: Point | null) => void
  city: City; setCity: (city: City) => void
  /** Chỗ đứng đặt bằng tay (chỉ lưu trên máy này). */
  standing: Standing | null; setStanding: (standing: Standing | null) => void
  /** Khu đã dùng làm chỗ đứng trên máy này, khu mới nhất đứng đầu. */
  usedAreas: string[]
  /** Bỏ chỗ đứng đặt tay: về khu đã chọn trước đó, không có thì về trạng thái không lấy được vị trí. */
  clearStanding: () => void
  /** Máy này có thể tự lấy vị trí không. Sai khi trang mở ở địa chỉ không an toàn. */
  canLocate: boolean
  /** Đang dùng chỗ đứng đặt tay (chưa có vị trí thật). */
  usingStanding: boolean
  /** Lần hỏi vị trí gần nhất không được. */
  locateFailed: boolean
  /** Hỏi vị trí của máy (xin quyền nếu chưa có). Được thì ghi vào origin và trả về điểm đó, không được thì trả về null. */
  locate: () => Promise<Point | null>
  roundId: string | null; setRoundId: (id: string | null) => void; path: string; id: string
  navigate: (path: string) => void
}
const standingKey = 'di-dau-cho-dung'
const failedKey = 'di-dau-khong-co-vi-tri'
const readFailed = () => { try { return sessionStorage.getItem(failedKey) === '1' } catch { return false } }
const usedKey = 'di-dau-khu-da-dung'
const cityKey = 'di-dau-thanh-pho'
const readUsed = () => { try { return readUsedAreas(localStorage.getItem(usedKey)) } catch { return [] } }
const readSaved = () => { try { return readStanding(localStorage.getItem(standingKey)) } catch { return null } }
const readCity = () => { try { return readCityPreference(localStorage.getItem(cityKey)) as City | null } catch { return null } }
const AppContext = createContext<AppContextValue | null>(null)
export function useApp() { return useContext(AppContext)! }
export function AppProvider({ children }: { children: ReactNode }) {
  const { state } = useStore()
  const [path, setPath] = useState(location.hash.slice(1) || '/')
  const [group, setGroup] = useState<Group>('an')
  const [where, setWhere] = useState<Where>(null)
  const [real, setOrigin] = useState<Point | null>(null)
  const [standing, updateStanding] = useState<Standing | null>(readSaved)
  const [usedAreas, updateUsed] = useState<string[]>(readUsed)
  const [cityPreference, updateCityPreference] = useState<City | null>(readCity)
  const [locateFailed, updateFailed] = useState(readFailed)
  const setLocateFailed = (value: boolean) => { updateFailed(value); try { if (value) sessionStorage.setItem(failedKey, '1'); else sessionStorage.removeItem(failedKey) } catch {} }
  const before = useRef<string | null>(null)
  const canLocate = canAskLocation({ secure: window.isSecureContext, hasApi: !!navigator.geolocation })
  const localReal = real && (!cityPreference || cityOfPoint(real, state.catalog.areas) === cityPreference) ? real : null
  const origin = pickOrigin(localReal, standing)
  const city = cityPreference || cityOfPoint(real || origin || CITY_CENTERS['ha-noi'], state.catalog.areas)
  const clearStanding = () => {
    const result = afterClear({ where, before: before.current })
    before.current = null
    updateStanding(null); try { localStorage.removeItem(standingKey) } catch {}
    setWhere(result.where)
    if (result.failed) setLocateFailed(true)
  }
  const setStanding = (value: Standing | null) => {
    if (value?.kind === 'khu' && value.areaId) { const next = rememberArea(usedAreas, value.areaId); updateUsed(next); try { localStorage.setItem(usedKey, JSON.stringify(next)) } catch {} }
    if (value) before.current = rememberBefore(where, before.current); updateStanding(value); try { if (value) localStorage.setItem(standingKey, writeStanding(value)); else localStorage.removeItem(standingKey) } catch {} }
  const setCity = useCallback((value: City) => {
    updateCityPreference(value)
    try { localStorage.setItem(cityKey, value) } catch {}
    if (real && cityOfPoint(real, state.catalog.areas) === value) { updateStanding(null); setWhere(null); try { localStorage.removeItem(standingKey) } catch {} return }
    if (cityOfPoint(pickOrigin(null, standing) || CITY_CENTERS['ha-noi'], state.catalog.areas) === value) return
    const center = CITY_CENTERS[value]
    const next = { lat: center.lat, lng: center.lng, kind: 'cham' as const }
    updateStanding(next)
    setWhere(center)
    try { localStorage.setItem(standingKey, writeStanding(next)) } catch {}
  }, [real, standing, state.catalog.areas])
  const [roundId, updateRound] = useState<string | null>(() => sessionStorage.getItem('di-dau-round'))
  const setRoundId = (id: string | null) => { updateRound(id); if (id) sessionStorage.setItem('di-dau-round', id); else sessionStorage.removeItem('di-dau-round') }
  useEffect(() => { const change = () => { setPath(location.hash.slice(1) || '/'); window.scrollTo(0, 0) }; addEventListener('hashchange', change); return () => removeEventListener('hashchange', change) }, [])
  // Lần mở đầu chưa chọn gì thì nơi là Gần đây (where trống), không tự chọn sẵn một khu.
  const locate = useCallback(() => new Promise<Point | null>(resolve => {
    // Địa chỉ không an toàn thì trình duyệt không cho định vị: không gọi, để người dùng đặt chỗ đứng bằng tay.
    if (!canAskLocation({ secure: window.isSecureContext, hasApi: !!navigator.geolocation })) { setLocateFailed(true); resolve(null); return }
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude }
      setOrigin(point)
      const actualCity = cityOfPoint(point, state.catalog.areas)
      if (!cityPreference) {
        updateCityPreference(actualCity)
        try { localStorage.setItem(cityKey, actualCity) } catch {}
      }
      setLocateFailed(false); resolve(point)
    }, () => { setLocateFailed(true); resolve(null) }, { timeout: 10000, maximumAge: 60000 })
  }), [])
  // Máy đã cho phép vị trí từ trước thì lấy luôn, không hiện hộp xin quyền. Chưa cho phép thì chờ người dùng bấm.
  useEffect(() => {
    let alive = true
    try { navigator.permissions?.query({ name: 'geolocation' }).then(status => { if (alive && status.state === 'granted') void locate() }, () => {}) } catch {}
    return () => { alive = false }
  }, [locate])
  let id = ''
  try { id = decodeURIComponent((path.split('/')[2] || '').split('?')[0]) } catch {}
  return <AppContext.Provider value={{ group, setGroup, where, setWhere, origin, setOrigin, city, setCity, standing, setStanding, usedAreas, clearStanding, canLocate, usingStanding: !!standing && !localReal, locateFailed, locate, roundId, setRoundId, path, id, navigate: path => { location.hash = path } }}>{children}</AppContext.Provider>
  }
