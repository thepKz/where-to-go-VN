import { useEffect, useRef, useState } from 'react'
import { useApp, useStore } from './app-context'
import { copy } from './copy'
import { catalogCities, filterPlacesByCity } from './core/index.mjs'
import { Button, Icon, Sheet } from './ui'
import HomNay from './screens/hom-nay'
import GoiY from './screens/goi-y'
import QuayMon from './screens/quay-mon'
import BanDo from './screens/ban-do'
import Khu from './screens/khu'
import ChiTiet from './screens/chi-tiet'
import CuaMinh from './screens/cua-minh'
import Nha from './screens/nha'

const cityNames = { 'ha-noi': 'Hà Nội', 'ho-chi-minh': 'TP Hồ Chí Minh' } as const

function CitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp()
  const { state } = useStore()
  const cities = catalogCities(state.catalog.places, state.catalog.areas)
  return <Sheet open={open} onClose={onClose} title="Chọn thành phố" returnFocus='[data-action="chon-thanh-pho"]' dialogProps={{ 'data-sheet': 'thanh-pho' }}>
    <div className="city-list">{cities.map(city => {
      const count = filterPlacesByCity(state.catalog.places, city, state.catalog.areas).filter(place => place.status !== 'closed').length
      return <Button key={city} className="city-row" data-city={city} aria-pressed={app.city === city} onClick={() => { app.setCity(city as keyof typeof cityNames); onClose() }}><span>{cityNames[city as keyof typeof cityNames] || city}</span><span className="city-count">{count} chỗ</span>{app.city === city && <Icon name="check" />}</Button>
    })}</div>
  </Sheet>
}

export default function App() {
  const { state } = useStore()
  const { path, navigate } = useApp()
  const app = useApp()
  const [cityOpen, setCityOpen] = useState(false)
  const firstScreenPath = useRef(path.split('?')[0])
  const hasRenderedScreen = useRef(false)
  const screenPath = path.split('?')[0]
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.page')
    if (!page) return
    const update = () => {
      const short = page.clientHeight < innerHeight * 0.8
      const top = short && page.scrollTop > 1
      const bottom = short && page.scrollHeight - page.clientHeight - page.scrollTop > 1
      page.style.maskImage = top || bottom ? `linear-gradient(to bottom, ${top ? 'transparent, black 12px' : 'black'}, ${bottom ? 'black calc(100% - 12px), transparent' : 'black'})` : ''
    }
    const observer = new ResizeObserver(update)
    observer.observe(page)
    if (page.firstElementChild) observer.observe(page.firstElementChild)
    page.addEventListener('scroll', update, { passive: true })
    update()
    return () => { observer.disconnect(); page.removeEventListener('scroll', update); page.style.maskImage = '' }
  }, [screenPath, state.ready])
  const animateScreen = hasRenderedScreen.current && firstScreenPath.current !== screenPath
  useEffect(() => { if (state.ready) { hasRenderedScreen.current = true; firstScreenPath.current = screenPath } }, [state.ready, screenPath])
  // Máy chưa ở trong nhà nào (đã bị gỡ) chỉ có màn Nhà: không còn dữ liệu nhà cũ để hiện.
  const route = state.identity.householdId ? path.split('/')[1]?.split('?')[0] : 'nha'
  const Screen = ({ '': HomNay, 'gan-day': HomNay, 'goi-y': GoiY, 'quay-mon': QuayMon, 'ban-do': BanDo, khu: Khu, cho: ChiTiet, 'cua-minh': CuaMinh, nha: Nha } as Record<string, React.ComponentType>)[route] || HomNay
  const source = new URLSearchParams(path.split('?')[1] || '').get('from')
  const current = route === 'nha' ? null : source === 'map' ? '/ban-do' : source === 'mine' ? '/cua-minh' : ['ban-do'].includes(route) ? '/ban-do' : route === 'cua-minh' ? '/cua-minh' : '/'
  return <div className="app-shell" data-picked-place-id={[...state.picks].sort((left, right) => right.picked_at.localeCompare(left.picked_at))[0]?.place_id}><header className="top" data-region="header">{['', 'ban-do', 'cua-minh'].includes(route) ? route === '' ? <span className="brand"><Icon name="pin" /><span className="brand-name">{copy.brand}</span></span> : <a className="brand" href="#/"><Icon name="pin" /><span className="brand-name">{copy.brand}</span></a> : <Button className="icon-button" aria-label={copy.back} icon="back" onClick={() => navigate('/')} />}<Button className="city-switch" data-action="chon-thanh-pho" data-city={app.city} aria-expanded={cityOpen} onClick={() => setCityOpen(true)}><span>{cityNames[app.city]}</span><Icon key={app.city} name="arrow" /></Button><nav className="nav" aria-label={copy.mainNav} data-region="nav">{[['/', copy.near, 'locate'], ['/ban-do', copy.map, 'map'], ['/cua-minh', copy.mine, 'heart']].map(([href, label, icon]) => <a key={href} href={`#${href}`} aria-current={current === href ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></a>)}</nav><div className="top-tools">{route !== 'nha' && <a className="button house-link" href="#/nha"><Icon name="people" /><span>{copy.house}</span></a>}</div></header>
    <div className="page">{state.error && <p className="notice" role="alert">{state.error}</p>}{state.ready ? <div className={animateScreen ? 'screen-transition' : ''} key={`${route}:${screenPath}`}><Screen /></div> : <div className="app-loading" role="status" aria-label="Đang mở"><strong>Đang mở</strong><progress aria-label="Đang mở" />{[0,1,2].map(index => <div key={index} aria-hidden="true" />)}</div>}</div>
    <CitySheet open={cityOpen} onClose={() => setCityOpen(false)} />
  </div>
}
