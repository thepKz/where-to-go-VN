import { useState } from 'react'
import { useApp, useStore } from '../../app-context'
import { copy } from '../../copy'
import { capitalizeFirst, directionsUrl, filterAreasByCity, filterPlacesByCity, pickDish, viewOrigin } from '../../core/index.mjs'
import type { Place } from '../../store'
import { Button, Card, EmptyState, GroupIcon, Icon, PlaceMeta, sharePlace } from '../../ui'
import './quay-mon.css'

const MAX_REROLLS = 2

export default function QuayMon() {
  const { store, state } = useStore()
  const app = useApp()
  const [seed] = useState(() => store.seed() ?? crypto.getRandomValues(new Uint32Array(1))[0])
  const [now] = useState(() => store.now())
  const [history, setHistory] = useState<string[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [turns, setTurns] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const places = filterPlacesByCity(store.getPlaces(), app.city, state.catalog.areas)
  const base = { places, dishes: state.catalog.dishes, marks: state.marks, picks: state.picks, now, seed }
  // Quay đúng nơi đang chọn ở màn Hôm nay: đã chọn khu thì trong khu đó, còn lại là gần vị trí của máy. Chưa có cả hai thì lấy cả thành phố và nói rõ như vậy.
  const areaId = typeof app.where === 'string' ? app.where : undefined
  const area = areaId ? filterAreasByCity(state.catalog.areas, app.city).find(item => item.id === areaId) : undefined
  const scopeOrigin = viewOrigin(app.origin, app.where)
  const scope: { origin?: typeof app.origin; areaId?: string } = areaId ? { areaId } : { origin: scopeOrigin }
  const result = pickDish({ ...base, ...scope, history })
  const seen = [...history, ...(result.dish ? [result.dish.id] : [])]
  const finished = history.length >= MAX_REROLLS || (!result.dish && history.length > 0)
  const dish = (chosen && seen.includes(chosen) ? state.catalog.dishes.find(item => item.id === chosen) : null) || result.dish
  // Quán của món đang hiện lấy đúng từ kết quả của pickDish ở lượt quay của món đó (luật chỗ chính nằm trong lõi), không tự lọc lại.
  const turnOf = dish ? seen.indexOf(dish.id) : -1
  const near = !dish || turnOf < 0 ? [] : turnOf === history.length ? result.places : (() => { const again = pickDish({ ...base, ...scope, history: seen.slice(0, turnOf) }); return again.dish?.id === dish.id ? again.places : [] })()
  const left = Math.max(0, MAX_REROLLS - history.length)
  const spin = () => { if (result.dish && history.length < MAX_REROLLS) { setHistory(current => [...current, result.dish!.id]); setChosen(null); setTurns(value => value + 1) } }

  const pickedPlace = picked ? store.getPlace(picked) : undefined
  const confirm = async (id: string) => {
    if (busy) return
    setBusy(true)
    try { await store.pickPlace(id); setPicked(id) } catch {} finally { setBusy(false) }
  }
  const send = async () => {
    if (!pickedPlace) return
    setNote('')
    const outcome = await sharePlace(pickedPlace)
    if (outcome === 'copied') setNote(copy.sendCopied); else if (outcome === 'failed') setNote(copy.sendFailed)
  }

  if (!state.ready) return <main data-screen="quay-mon" className="dish-screen"><EmptyState>{copy.loading}</EmptyState></main>
  return <main data-screen="quay-mon" className="dish-screen">
    <div className="screen-title"><h1>{copy.spin}</h1></div>
    <p className="dish-scope" data-scope={area ? 'khu' : 'gan-day'}>{area ? <>{copy.dish.scopeArea} <span data-area-name>{area.name}</span></> : copy.dish.scopeNear}</p>
    {!dish && !pickedPlace ? <EmptyState action={<Button onClick={() => app.navigate('/')}>{copy.area}</Button>}><span role={state.error ? 'alert' : 'status'}>{state.error || copy.dish.empty}</span></EmptyState> : <div className={`dish-layout${pickedPlace ? ' solo' : ''}`}>
      {!pickedPlace && dish && <section className="dish-intro" aria-live="polite" aria-atomic="true">
        <GroupIcon group="an" className={`dish-symbol ${turns ? 'turned' : ''}`} key={`symbol-${turns}`} />
        <div key={dish.id} className="dish-reveal"><h2 className="dish-name" data-dish={dish.id} data-dish-name>{capitalizeFirst(dish.name)}</h2>{dish.blurb && <p data-place-field="dishes">{dish.blurb}</p>}</div>
      </section>}
       <Card className="dish-panel" data-region="dish-panel">
         {pickedPlace ? <div className="dish-chosen" data-chosen data-place-id={pickedPlace.id}>
          <span className="chosen-mark" aria-hidden="true"><Icon name="check" /></span>
          <h2 data-name data-place-name>{pickedPlace.name}</h2>
          <a className="button primary" data-action="chi-duong" href={directionsUrl(pickedPlace)} target="_blank" rel="noopener noreferrer"><Icon name="arrow" />{copy.direction}</a>
          <Button data-action="gui-nguoi-kia" icon="share" onClick={() => void send()}>{copy.send}</Button>
          <a className="button quiet" href={`#/cho/${encodeURIComponent(pickedPlace.id)}`}>{copy.viewPlace}</a>
           {note && <p className="small" role="status">{note}</p>}
         </div> : <>
         {!dish ? null : finished ? <div className="dish-choices" data-rerolls-left="0">
           <p role="status">{seen.length >= 3 ? copy.dish.limit : 'Chọn một trong các món vừa quay nhé'}</p>
           <div>{seen.map(id => { const item = state.catalog.dishes.find(entry => entry.id === id); return item && <Button key={id} data-dish={id} aria-pressed={dish.id === id} onClick={() => setChosen(id)}><span data-dish-name>{capitalizeFirst(item.name)}</span></Button> })}</div>
          </div> : <Button icon="shuffle" aria-label={`${copy.dish.again}, còn ${left} lần`} data-action="quay-lai" data-rerolls-left={left} onPointerDown={spin}><span className="dish-again-label" data-short={`${copy.dish.again}, còn ${left}`}>{`${copy.dish.again}, còn ${left} lần`}</span></Button>}
         <div className="dish-places">{near.map((place, index) => {
          return <div key={place.id} className="dish-place" data-card data-place-id={place.id}>
            <a className="dish-place-link" href={'#/cho/' + encodeURIComponent(place.id)}>
            <GroupIcon group="an" />
            <span className="dish-place-copy"><strong data-place-name>{place.name}</strong><PlaceMeta place={place} origin={area ? null : scopeOrigin} /></span>
            <Icon name="arrow" />
            </a>
            {index === 0 ? <Button primary data-action="chot" disabled={busy} onClick={() => void confirm(place.id)}>{copy.confirmShort}</Button> : null}
          </div>
         })}</div>
         {!near.length && <p role="status">{copy.dish.empty}</p>}
         </>}
      </Card>
    </div>}
  </main>
}
