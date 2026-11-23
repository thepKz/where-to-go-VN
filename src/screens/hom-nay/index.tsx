import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PersonName, useApp, useStore } from '../../app-context'
import { copy } from '../../copy'
import { HO_GUOM, areaNamesLine, aroundAreaName, cuisineMatches, cuisineOf, directionsUrl, distanceMeters, filterAreasByCity, filterPlacesByCity, formatAreaInsideCount, formatDate, formatDistance, mapTarget, placeNameInArea, priceLabel, standingAreaOrder, standingFromArea } from '../../core/index.mjs'
import type { Area, Group, Place } from '../../store'
import { PlaceRow, Button, Card, Chip, EmptyState, HoursLine, Icon, KindLine, PlaceMeta, Sheet, distanceOf, useWide } from '../../ui'
import MapView, { type MapPin } from '../ban-do/map-view'
import { groupByDish } from '../../core/dish-groups.mjs'
import './hom-nay.css'

const groups = Object.keys(copy.groups) as Group[]
const cuisineNames: Record<string, string> = { viet: 'Việt', thai: 'Thái', han: 'Hàn', nhat: 'Nhật', trung: 'Trung', y: 'Ý', au: 'Âu', phap: 'Pháp', my: 'Mỹ', 'an-do': 'Ấn độ', chay: 'Chay', 'hai-san': 'Hải sản', 'lau-nuong': 'Lẩu nướng', 'an-vat': 'Ăn vặt', 'banh-ngot': 'Bánh ngọt', 'do-uong': 'Đồ uống' }

function isContainer(area: Area) { return area.type === 'mall' || area.kind === 'mall' }
function areaFor(place: Place, areas: Area[]) { return place.areaId ? areas.find(area => area.id === place.areaId) : undefined }
function areaCounts(area: Area, places: Place[], group: Group, selectedCuisine: string | null, cuisines: { id: string; name: string }[] | undefined) {
  const counts = new Map<Group, number>()
  for (const place of places) {
    if (place.areaId !== area.id || place.status === 'closed') continue
    if (place.group !== group || !cuisineMatches(place, selectedCuisine, cuisines)) continue
    counts.set(place.group, (counts.get(place.group) || 0) + 1)
  }
  return groups.map(group => ({ group, count: counts.get(group) || 0 })).filter(row => row.count)
}

function CuisineFilters({ options, counts, selected, onChange, labels }: { options: string[]; counts: Record<string, number>; selected: string | null; onChange: (value: string | null) => void; labels: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(options)
  const [moreOpen, setMoreOpen] = useState(false)
  const ordered = useMemo(() => [...options].sort((left, right) => (counts[right] || 0) - (counts[left] || 0) || options.indexOf(left) - options.indexOf(right)), [counts, options])
  const displayOptions = useMemo(() => selected ? [selected, ...ordered.filter(id => id !== selected)] : ordered, [ordered, selected])
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const check = () => {
      const widths = new Map([...element.querySelectorAll<HTMLElement>('[data-cuisine-measure]')].map(node => [node.dataset.cuisineMeasure || '', node.getBoundingClientRect().width]))
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0
      const allWidth = (ids: string[]) => (widths.get('tat-ca') || 0) + ids.reduce((sum, id) => sum + (widths.get(id) || 0), 0) + gap * ids.length
      if (allWidth(ordered) <= element.clientWidth) { setShown(ordered); return }
      const moreWidth = widths.get('mon-khac') || 74
      const next: string[] = []
      for (const id of displayOptions) {
        if (allWidth([...next, id]) + moreWidth + gap > element.clientWidth && next.length) continue
        next.push(id)
      }
      setShown(previous => previous.join('|') === next.join('|') ? previous : next)
    }
    const resize = new ResizeObserver(check)
    resize.observe(element); element.addEventListener('scroll', check, { passive: true }); check()
    return () => { resize.disconnect(); element.removeEventListener('scroll', check) }
  }, [displayOptions, ordered])
  const hidden = new Set(displayOptions.filter(id => !shown.includes(id)))
  const showMore = hidden.size > 0
  return <>
    <Button className="gd-cuisine-trigger" aria-label={selected ? `Loại món: ${labels[selected] || selected}` : "Loại món"} data-action="loai-mon" onClick={() => setMoreOpen(true)}><Icon name="filter" /><span className="gd-filter-label">{selected ? labels[selected] || selected : "Loại món"}</span></Button>
    <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Chọn loại món" returnFocus='[data-action="loai-mon"]' dialogProps={{ 'data-sheet': 'loai-mon' }}>
      <div ref={ref} className="gd-cuisines" data-cuisine-row>
        <button type="button" className={`chip${!selected ? ' is-selected' : ''}`} data-cuisine-all data-cuisine="tat-ca" aria-pressed={!selected} onClick={() => { onChange(null); setMoreOpen(false) }}><span data-choice-label>Tất cả</span></button>
        {displayOptions.map(id => <Chip key={id} data-cuisine={id} selected={selected === id} onClick={() => { onChange(id); setMoreOpen(false) }}><span data-choice-label>{labels[id] || id}</span></Chip>)}
        {showMore && <Chip data-cuisine-more data-action="mon-khac" onClick={() => setMoreOpen(true)}><span data-choice-label>Món khác</span></Chip>}
        <div className="gd-cuisine-measure" aria-hidden="true"><span data-cuisine-measure="tat-ca" className="chip">Tất cả</span>{displayOptions.map(id => <span key={id} data-cuisine-measure={id} className="chip">{labels[id] || id}</span>)}<span data-cuisine-measure="mon-khac" className="chip">Món khác</span></div>
      </div>
    </Sheet>
  </>
}

function AreaNames({ names, count }: { names: string[]; count: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fits, setFits] = useState(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const canvas = document.createElement('canvas').getContext('2d')
    const check = () => {
      if (!canvas) return
      canvas.font = getComputedStyle(node).font
      setFits(canvas.measureText(areaNamesLine(names, count, true)).width <= node.clientWidth)
    }
    void document.fonts.ready.then(check)
    const resize = new ResizeObserver(check)
    resize.observe(node)
    check()
    return () => resize.disconnect()
  }, [names.join('|'), count])
  return <span ref={ref} className="gd-area-names">{areaNamesLine(names, count, fits)}</span>
}

function useFittedLabel(fullLabel: string) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [visibleLabel, setVisibleLabel] = useState(fullLabel)
  useLayoutEffect(() => {
    const label = labelRef.current
    if (!label) return
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) return
    const fit = () => {
      canvas.font = getComputedStyle(label).font
      let text = fullLabel
      while (text && canvas.measureText(text + (text === fullLabel ? '' : '…')).width > label.clientWidth) text = text.slice(0, -1)
      setVisibleLabel(text === fullLabel ? text : text.trimEnd() + '…')
    }
    const observer = new ResizeObserver(fit)
    observer.observe(label)
    fit()
    void document.fonts.ready.then(fit)
    return () => observer.disconnect()
  }, [fullLabel])
  return [labelRef,visibleLabel] as const
}
function HotName({ name }: { name: string }) {
  const [ref,label] = useFittedLabel(name)
  return <strong ref={ref} data-place-name title={name} aria-label={name}>{label}</strong>
}
function Standing({ onChange }: { onChange: () => void }) {
  const { state } = useStore()
  const app = useApp()
  const standingArea = app.standing?.kind === 'khu' ? state.catalog.areas.find(area => area.id === app.standing?.areaId) : undefined
  const nearest = app.origin ? [...filterAreasByCity(state.catalog.areas, app.city)].sort((left, right) => (distanceMeters(app.origin!, left) ?? Infinity) - (distanceMeters(app.origin!, right) ?? Infinity))[0] : undefined
  const cityAnchor = app.usingStanding && app.standing?.kind === 'cham' && app.city === 'ho-chi-minh' && Math.abs(app.standing.lat - 10.7725) < 0.001 && Math.abs(app.standing.lng - 106.698) < 0.001
  const isDefault = !app.origin && !app.usingStanding
  const areaName = cityAnchor ? 'chợ Bến Thành' : standingArea?.name || nearest?.name || (app.city === 'ho-chi-minh' ? 'chợ Bến Thành' : 'Hồ Gươm')
  const fullLabel = aroundAreaName(areaName)
  const [labelRef,visibleLabel] = useFittedLabel(fullLabel)
  return <Button className="gd-standing" data-action="doi-cho-dung" aria-label={aroundAreaName(areaName)} data-standing-default={isDefault ? '' : undefined} data-standing={app.origin ? 'that' : app.usingStanding ? 'manual' : 'default'} data-where="gan-day" aria-pressed={Boolean(app.origin || app.usingStanding)} data-manual-location={app.usingStanding || undefined} onClick={onChange}><span className="gd-standing-label" ref={labelRef} data-area-name>{visibleLabel}</span><Icon name="arrow" /></Button>
}

function DishGroup({name, places, origin}: {name:string; places:Place[]; origin:{lat:number;lng:number}}) {
  const [expanded, setExpanded] = useState(false)
  const row = (place:Place) => <PlaceRow key={place.id} place={place} origin={origin} source="near" />
  return <section className="dish-group"><h2>{name}<small>{places.length}</small></h2>{places.slice(0,3).map(row)}{places.length > 3 && <><div className="dish-expand" data-open={expanded} inert={!expanded}><div>{expanded && places.slice(3).map(row)}</div></div><Button data-action="xem-them" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu gọn' : 'Xem thêm '+(places.length-3)}</Button></>}</section>
}
function HotRow({places,origin}:{places:Place[];origin:{lat:number;lng:number}}) {
  const rail = useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{const el=rail.current;if(!el)return;const wheel=(e:WheelEvent)=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){const before=el.scrollLeft;el.scrollLeft+=e.deltaY;if(el.scrollLeft!==before)e.preventDefault()}};el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel)},[places.length])
  const drag = useRef({start:0, left:0, down:false, moved:false})
  if (!places.length) return null
  return <section className="gd-hot" data-section="hot"><h2><Icon name="flame"/>Đang hot <small>{places.length}</small></h2><div ref={rail} className="gd-hot-list" tabIndex={0} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(e.pointerType==='mouse' && e.button===0)drag.current={start:e.clientX,left:e.currentTarget.scrollLeft,down:true,moved:false}}} onPointerMove={e=>{const state=drag.current;if(!state.down||!e.buttons)return;const delta=e.clientX-state.start;if(Math.abs(delta)>5){state.moved=true;e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.scrollLeft=state.left-delta}}} onPointerUp={()=>{drag.current.down=false}} onClickCapture={e=>{if(drag.current.moved){e.preventDefault();drag.current.moved=false}}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.currentTarget.scrollLeft+=e.key==='ArrowRight'?250:-250}}}>{places.map(place=><PlaceRow key={place.id} place={place} origin={origin} source="near"/>)}</div></section>
}

function RecentMiniMap({ pins, origin, center }: { pins: MapPin[]; origin: { lat: number; lng: number } | null; center: { lat: number; lng: number } }) {
  const points = useMemo(() => [...pins.map(pin => ({ lat: pin.lat, lng: pin.lng })), ...(origin ? [origin] : [])], [pins, origin?.lat, origin?.lng])
  const fit = useMemo(() => ({ points: points.length ? points : [center], n: points.map(point => `${point.lat},${point.lng}`).join('|') }), [points, center])
  return <div className="recent-map-column">
  <div className="mini-map recent-mini-map" data-mini-map>
    <MapView pins={pins} origin={origin} fly={null} center={null} selectedId={null} onSelect={id => { window.location.hash = `#/ban-do?cho=${encodeURIComponent(id)}&from=near` }} onAreaSelect={id => { window.location.hash = `#/ban-do?khu=${encodeURIComponent(id)}&from=near` }} onTiles={() => {}} fit={fit} mini />
  </div>
  </div>
}

function useLowFrame() {
  const query = '(max-height:499px)'
  const [low, setLow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const change = () => setLow(media.matches)
    media.addEventListener('change', change); change()
    return () => media.removeEventListener('change', change)
  }, [])
  return low
}

function TodayCard({ low = false }: { low?: boolean }) {
  const { store, state } = useStore()
  const today = formatDate(store.now())
  const pick = [...state.picks].filter(item => formatDate(item.picked_at) === today).sort((left, right) => right.picked_at.localeCompare(left.picked_at))[0]
  const place = pick ? store.getPlace(pick.place_id) : undefined
  const key = pick ? `di-dau-bo-the-${today}-${pick.place_id}` : ''
  const [dismissed, setDismissed] = useState(() => { try { return key ? localStorage.getItem(key) === '1' : false } catch { return false } })
  if (!place || dismissed) return null
  const member = pick.picked_by ? state.members.find(item => item.id === pick.picked_by) : undefined
  const pickedBy = member?.name && member.name !== copy.deviceDefault ? member.name : ''
  return <Card className={`today-card${low ? ' today-low' : ''}`} data-today-place-id={place.id} data-picked-by={pickedBy}>
    <div className="today-card-copy"><strong>{copy.todayGo}</strong><span data-place-name title={place.name}>{place.name}</span>{pickedBy && <span className="small"><PersonName id={pick.picked_by!} /> {copy.pickedBy}</span>}</div>
    <div className="today-card-actions"><a className={`button ${low ? 'secondary' : 'primary'}`} data-action="chi-duong" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Icon name="arrow" />{copy.direction}</a><a className="button secondary" data-action="xem-cho" aria-label={copy.viewPlace} href={`#/cho/${encodeURIComponent(place.id)}?from=near`}>{copy.see}</a><Button className="today-dismiss" data-action="bo-the-hom-nay" icon="close" aria-label={copy.dismissToday} onClick={() => { setDismissed(true); try { localStorage.setItem(key, '1') } catch {} }} /></div>
  </Card>
}

export default function HomNay() {
  useLayoutEffect(() => {
    const cleanups = Array.from(document.querySelectorAll<HTMLElement>('.gd-list,.gd-hot-list'), node => {
      const horizontal = node.classList.contains('gd-hot-list')
      const sync = () => {
        const offset = horizontal ? node.scrollLeft : node.scrollTop
        const range = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight
        const start = offset > 1, end = offset < range - 1
        node.style.maskImage = start || end ? 'linear-gradient(to ' + (horizontal ? 'right' : 'bottom') + ', ' + (start ? 'transparent, black 12px' : 'black') + ', ' + (end ? 'black calc(100% - 12px), transparent' : 'black') + ')' : ''
      }
      const resize = new ResizeObserver(sync)
      resize.observe(node); node.addEventListener('scroll', sync); sync()
      return () => { resize.disconnect(); node.removeEventListener('scroll', sync) }
    })
    return () => cleanups.forEach(clean => clean())
  })
  const { store, state } = useStore()
  const app = useApp()
  const wide = useWide()
  const low = useLowFrame()
  const [askOpen, setAskOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [areaQuery, setAreaQuery] = useState('')
  const [cuisine, setCuisine] = useState<string | null>(null)

  const all = filterPlacesByCity(store.getPlaces(), app.city, state.catalog.areas).filter(place => place.status !== 'closed')
  const cityAreas = filterAreasByCity(state.catalog.areas, app.city)
  const currentAreas = cityAreas.filter(isContainer)
  const activePlaces = useMemo(() => all.filter(place => place.group === app.group && cuisineMatches(place, cuisine, state.catalog.cuisines)), [all, app.group, cuisine, state.catalog.cuisines])
  const hotPlaces = useMemo(() => all.filter(place => place.group === app.group && place.hot && cuisineMatches(place, cuisine, state.catalog.cuisines)).sort((left, right) => left.hot!.rank - right.hot!.rank).slice(0, 4), [all, app.group, cuisine, state.catalog.cuisines])
  const groupPlaces = useMemo(() => all.filter(place => place.group === app.group), [all, app.group])
  const cuisineOptions = useMemo(() => {
    const ids = new Set(groupPlaces.flatMap(place => cuisineOf(place, state.catalog.cuisines)))
    const order = ['viet', 'lau-nuong', 'an-vat', 'han', 'nhat', 'thai', 'trung', 'au', 'y', 'phap', 'hai-san', 'chay']
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...ids].sort((left, right) => (rank.get(left) ?? 999) - (rank.get(right) ?? 999) || (state.catalog.cuisines?.find(item => item.id === left)?.name || cuisineNames[left] || left).localeCompare(state.catalog.cuisines?.find(item => item.id === right)?.name || cuisineNames[right] || right, 'vi'))
  }, [groupPlaces, state.catalog.cuisines])
  const cuisineCounts = useMemo(() => Object.fromEntries(cuisineOptions.map(id => [id, groupPlaces.filter(place => cuisineOf(place, state.catalog.cuisines).includes(id)).length])), [cuisineOptions, groupPlaces, state.catalog.cuisines])
  const displayOrigin = app.origin || HO_GUOM
  const rows = useMemo(() => {
    const containerRows = currentAreas.map(area => ({ area, counts: areaCounts(area, all, app.group, cuisine, state.catalog.cuisines), meters: distanceMeters(displayOrigin, area), sortRank: 0, sortMeters: distanceMeters(displayOrigin, area) ?? Infinity })).filter(row => row.counts.length)
    const hiddenAreas = new Set(containerRows.map(row => row.area.id))
    const placeRows = activePlaces.filter(place => !place.areaId || !hiddenAreas.has(place.areaId)).map(place => {
      const area = areaFor(place, state.catalog.areas)
      const exact = distanceOf(displayOrigin, place)
      return { place, meters: exact, sortRank: exact === null ? 1 : 0, sortMeters: exact ?? (area ? distanceMeters(displayOrigin, area) ?? Infinity : Infinity) }
    })
    return [...containerRows.map(row => ({ type: 'area' as const, ...row })), ...placeRows.map(row => ({ type: 'place' as const, ...row }))].sort((left, right) => {
      if (left.sortRank !== right.sortRank) return left.sortRank - right.sortRank
      if (left.sortMeters !== right.sortMeters) return left.sortMeters - right.sortMeters
      return left.type === right.type ? String(left.type === 'area' ? left.area.name : left.place.name).localeCompare(String(right.type === 'area' ? right.area.name : right.place.name), 'vi') : left.type === 'area' ? -1 : 1
    })
  }, [displayOrigin, activePlaces, all, app.group, cuisine, currentAreas, state.catalog.areas, state.catalog.cuisines])
  const center = displayOrigin
  const miniPins = useMemo(() => rows.flatMap(row => {
    if (row.type === 'area') return [{ id: `area:${row.area.id}`, name: row.area.name, group: app.group, geo: 'area' as const, lat: row.area.lat, lng: row.area.lng, areaId: row.area.id, area: true, count: row.counts[0].count }]
    const target = mapTarget(row.place, state.catalog.areas)
    return target ? [{ id: row.place.id, name: row.place.name, group: row.place.group, geo: row.place.geo, lat: target.lat, lng: target.lng, areaId: target.areaId || undefined }] : []
  }).slice(0, 30), [rows, app.group, state.catalog.areas])
  const standHere = (area: Area) => { const standing = standingFromArea(area); if (!standing) return; app.setStanding(standing); app.setWhere({ lat: standing.lat, lng: standing.lng }); setAskOpen(false) }
  const startSuggest = () => { const where = app.where || app.origin || null; app.setRoundId(null); app.setWhere(where); app.navigate('/goi-y') }
  const visible = rows.filter(row => row.type === 'area')
  const bins = groupByDish(rows.flatMap(row => row.type === 'place' ? [row.place] : []))

  return <main data-screen="gan-day" className="gan-day">
    <div className="gd-layout">
      {!low && <TodayCard />}
      <section className="gd-controls">

        <Standing onChange={() => { setAreaQuery(''); setAskOpen(true) }} />
        <div className="gd-groups" data-group>{groups.map(group => <Chip key={group} data-group={group} selected={app.group === group} onClick={() => { app.setGroup(group); setCuisine(null) }}>{copy.groups[group]}</Chip>)}</div>
        {app.group === 'an' && <CuisineFilters options={cuisineOptions} counts={cuisineCounts} selected={cuisine} labels={Object.fromEntries(cuisineOptions.map(id => [id, state.catalog.cuisines?.find(item => item.id === id)?.name || cuisineNames[id] || id]))} onChange={value => { setCuisine(value) }} />}
        <div className="gd-actions"><Button primary data-action="chon-giup" onClick={() => setHelpOpen(true)}><Icon name="shuffle" />Chọn giúp</Button></div>
      </section>
      <RecentMiniMap pins={miniPins} origin={app.origin} center={center} />
      <div className="gd-results">
      <section key={`${app.group}:${cuisine || ''}`} className="gd-list swap" data-list="gan-day" tabIndex={0}>
        {low && <TodayCard low />}
        <HotRow places={hotPlaces} origin={displayOrigin} />
         {!rows.length ? <EmptyState>{cuisine ? 'Chưa có chỗ nào khớp loại món này' : `Chưa có chỗ ${copy.groups[app.group].toLocaleLowerCase('vi')} phù hợp quanh đây`}</EmptyState> : <>
          {Array.from(bins, ([name,places]) => <DishGroup key={name} name={name} places={places} origin={displayOrigin}/> )}
          {visible.map(row => <a key={row.area.id} className="gd-area" data-container={row.area.id} href={`#/khu/${encodeURIComponent(row.area.id)}?from=near`}><span className="gd-area-icon"><Icon name="building" /></span><span className="gd-area-copy"><strong data-area-name aria-label={row.area.name}>{row.area.name}</strong>{cuisine ? <span className="gd-area-count" data-place-field="counts" data-user-content><strong>{formatAreaInsideCount(row.counts[0].count)}</strong><br /><AreaNames count={row.counts[0].count} names={activePlaces.filter(place => place.areaId === row.area.id).slice(0, 2).map(place => placeNameInArea(place, row.area))} /></span> : <span className="gd-area-count" data-place-field="counts" data-user-content><strong>{formatAreaInsideCount(row.counts[0].count, `chỗ ${copy.groups[app.group].toLocaleLowerCase('vi')}`)}</strong></span>}</span>{row.meters !== null && <span className="gd-area-distance" data-distance={row.meters}>{formatDistance(row.meters, 'exact')}</span>}<Icon name="arrow" /></a>)}

        </>}
      </section>
      </div>
    </div>
    <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Chọn giúp" returnFocus='[data-action="chon-giup"]' dialogProps={{ 'data-sheet': 'chon-giup' }}><div className="gd-help-sheet"><Button primary data-action="goi-y" onClick={() => { setHelpOpen(false); startSuggest() }}>Chọn hộ tôi</Button><Button data-action="quay-mon" onClick={() => { setHelpOpen(false); app.navigate('/quay-mon') }}>Quay món</Button></div></Sheet>
    <Sheet open={askOpen} onClose={() => setAskOpen(false)} title="Bạn đang ở đâu" dialogProps={{ 'data-sheet': 'cho-dung' }}><div className="gd-area-list">{app.standing && <Button data-action="bo-cho-dung" onClick={() => { app.clearStanding(); setAskOpen(false) }}>{copy.standing.clear}</Button>}<input aria-label={copy.standing.filter} placeholder={copy.standing.filter} value={areaQuery} onChange={event => setAreaQuery(event.target.value)} />{app.canLocate && <Button primary data-action="dung-vi-tri" onClick={async () => { const point = await app.locate(); if (point) setAskOpen(false) }}><Icon name="locate" />{copy.standing.useLocation}</Button>}<Button data-action="chon-tren-ban-do" onClick={() => { setAskOpen(false); app.navigate('/ban-do/dat') }}><Icon name="map" />{copy.standing.pickOnMap}</Button>{standingAreaOrder(filterAreasByCity(state.catalog.areas, app.city).filter(area => !areaQuery || area.name.toLocaleLowerCase('vi').includes(areaQuery.toLocaleLowerCase('vi'))), app.origin ? [] : app.usedAreas, app.origin || app.standing || HO_GUOM).map(area => <Button key={area.id} data-area-id={area.id} data-action="dung-o-khu" onClick={() => standHere(area)}><span data-area-name>{area.name}</span><Icon name="arrow" /></Button>)}</div></Sheet>
  </main>
}
