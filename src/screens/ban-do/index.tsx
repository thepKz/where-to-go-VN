import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useApp, useStore } from '../../app-context'
import { copy } from '../../copy'
import { CITY_CENTERS, filterAreasByCity, filterPlacesByCity, filterMapPlacesInBounds, floorLabel, foldText, formatAreaCount, formatDistance, framePoints, mapCityBounds, mapTarget, nearSummary, standingFromTap } from '../../core/index.mjs'
import type { Area, Group, Place } from '../../store'
import { Badge, Button, Chip, EmptyState, HoursLine, Icon, KindLine, PlaceRow, ScrollArea, Sheet, distanceOf } from '../../ui'
import MapView, { type MapBounds, type MapFit, type MapFly, type MapPin } from './map-view'
import { SearchIcon } from './icons'
import './ban-do.css'

const groups = Object.keys(copy.groups) as Group[]
const noMatch = 'Không có chỗ nào khớp'
const seeLabel = 'Xem chỗ này'

export default function BanDo() {
  const { store, state } = useStore()
  const app = useApp()
  
  const [on, setOn] = useState<Group[]>([app.group])
  const [query, setQuery] = useState('')
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [areaSheetId, setAreaSheetId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null)
  const [tilesOk, setTilesOk] = useState(true)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')
  const previousCity = useRef(app.city)
  // Tới bằng lối chọn trên bản đồ thì vào thẳng chế độ đặt chỗ đứng.
  const [placing, setPlacing] = useState(() => app.path === '/ban-do/dat' && !app.origin)
  const [fly, setFly] = useState<MapFly | null>(null)
  const routeQuery = app.path.includes('?') ? new URLSearchParams(app.path.split('?')[1]) : null
  const queryPlace = routeQuery?.get('cho') || null
  const queryArea = routeQuery?.get('khu') || null
  const cityAreas = useMemo(() => filterAreasByCity(state.catalog.areas, app.city), [state.catalog.areas, app.city])
  const area = areaId ? cityAreas.find(item => item.id === areaId) || null : null
  const all = useMemo(() => filterPlacesByCity(store.getPlaces(), app.city, state.catalog.areas), [state.catalog.places, state.custom_places, app.city, state.catalog.areas])
  const cityBounds: MapBounds | null = useMemo(() => mapCityBounds({ places: all, areas: cityAreas }), [all, cityAreas])
  const mappable = (place: Place) => !!mapTarget(place, cityAreas)
  const filtered = useMemo(() => all.filter(place => place.status !== 'closed' && (!on.length || on.includes(place.group)) && (!areaId || place.areaId === areaId)),
    [all, on, areaId])
  const visible = useMemo(() => filtered.filter(mappable), [filtered, cityAreas])
  const listOrigin = app.origin || app.standing || CITY_CENTERS[app.city]
  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const mappedDistance = (place: Place) => distanceOf(listOrigin, place)
    const leftDistance = mappedDistance(left), rightDistance = mappedDistance(right)
    if (leftDistance === null && rightDistance !== null) return 1
    if (leftDistance !== null && rightDistance === null) return -1
    if (leftDistance !== null && rightDistance !== null && leftDistance !== rightDistance) return leftDistance - rightDistance
    return left.name.localeCompare(right.name, 'vi') || left.id.localeCompare(right.id)
  }), [filtered, listOrigin])
  const areaPins: MapPin[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const place of filtered) if (place.areaId) counts.set(place.areaId, (counts.get(place.areaId) || 0) + 1)
    return cityAreas.filter(area => (area.type === 'mall' || area.kind === 'mall') && counts.has(area.id)).map(area => ({
      id: `area:${area.id}`, name: area.name, group: on[0] || 'an', geo: 'area', lat: area.lat, lng: area.lng, areaId: area.id, area: true, count: counts.get(area.id),
    }))
  }, [filtered, on, cityAreas])
  const framePlaces = useMemo(() => {
    if (!viewBounds) return []
    const malls = new Map(areaPins.map(pin => [pin.areaId, pin]))
    const singles = new Set(filterMapPlacesInBounds(filtered, viewBounds, place => mapTarget(place, cityAreas)))
    return filtered.filter(place => {
      if (!malls.has(place.areaId || '')) return singles.has(place)
      const target = malls.get(place.areaId || '') || mapTarget(place, cityAreas)
      if (place.geo === 'area' && !malls.has(place.areaId || '')) return false
      return target && target.lat >= viewBounds.south && target.lat <= viewBounds.north && target.lng >= viewBounds.west && target.lng <= viewBounds.east
    })
  }, [filtered, viewBounds, areaPins, cityAreas])
  const separate = !!areaSheetId
  const pins: MapPin[] = useMemo(() => [
    ...areaPins,
    ...(areaSheetId || !viewBounds ? visible : framePlaces).filter(place => areaSheetId || (!areaPins.some(pin => pin.areaId === place.areaId) && place.geo !== 'area')).map((place, index) => {
      if (areaSheetId && area) {
        const angle = (index + .5) * 2 * Math.PI / visible.length
        const radius = Math.max(62, visible.length * 7) * 360 / (256 * 2 ** 16)
        return {direct: true, id: place.id, name: place.name, group: place.group, geo: place.geo, areaId: area.id, lat: area.lat + radius * Math.sin(angle) * Math.cos(area.lat * Math.PI / 180), lng: area.lng + radius * Math.cos(angle)}
      }
      const target = mapTarget(place, cityAreas)!
      return { direct: separate, hot: place.badges.length > 0, id: place.id, name: place.name, group: place.group, geo: place.geo, lat: target.lat, lng: target.lng, areaId: target.areaId || undefined }
    }),
  ], [areaPins, visible, framePlaces, viewBounds, areaSheetId, separate, area, cityAreas])
  const found = foldText(query)
  const areaMatches = found ? cityAreas.filter(item => foldText(item.name).includes(found)).slice(0, 2) : []
  const placeMatches = found ? all.filter(place => foldText(place.name).includes(found) || (place.areaId && foldText(cityAreas.find(item => item.id === place.areaId)?.name || '').includes(found))).slice(0, 3) : []
  const suggestionCount = areaMatches.length + placeMatches.length
  const selected = sheetId ? store.getPlace(sheetId) : undefined
  const selectedArea = selected?.areaId ? cityAreas.find(item => item.id === selected.areaId) : undefined
  const areaSheetArea = areaSheetId ? cityAreas.find(item => item.id === areaSheetId) || null : null
  const areaSheetPlaces = useMemo(() => {
    if (!areaSheetArea) return []
    const floorOrder = new Map((areaSheetArea.floors || []).map((floor, index) => [floor, index]))
    return all.filter(place => place.status !== 'closed' && place.areaId === areaSheetArea.id && on.includes(place.group)).sort((left, right) => {
      const leftFloor = floorOrder.get(left.floor || '') ?? Number.MAX_SAFE_INTEGER
      const rightFloor = floorOrder.get(right.floor || '') ?? Number.MAX_SAFE_INTEGER
      return leftFloor - rightFloor || String(left.floor || '').localeCompare(String(right.floor || ''), 'vi') || left.name.localeCompare(right.name, 'vi')
    })
  }, [all, areaSheetArea, on])
  const [areaDocked,setAreaDocked] = useState(() => matchMedia('(min-width:600px)').matches)
  useEffect(() => { const media = matchMedia('(min-width:600px)'); const sync = () => setAreaDocked(media.matches); media.addEventListener('change',sync); return () => media.removeEventListener('change',sync) }, [])
  const selectedDistance = selected ? distanceOf(app.origin, selected) : null
  const badges = (place: Place) => {
    const marks = state.marks.filter(mark => mark.place_id === place.id)
    return [...place.badges, ...(marks.some(mark => mark.verdict === 'great') ? ['ngon-that'] : []), ...(new Set(marks.filter(mark => mark.want).map(mark => mark.member_id)).size > 1 ? ['ca-hai-muon-di'] : [])]
  }
  const flyTo = (lat: number, lng: number, zoom: number) => setFly(current => ({ lat, lng, zoom, n: (current?.n || 0) + 1 }))
  const open = (id: string) => { setSheetId(id); setInfoOpen(!areaSheetId) }
  const locate = async () => {
    setMessage(''); setPlacing(false)
    setLocating(true)
    const point = await app.locate()
    setLocating(false)
    const spot = point || app.standing
    if (spot) flyTo(spot.lat, spot.lng, 15); else setMessage(app.canLocate ? copy.denied : copy.insecure)
  }
  // Chưa có vị trí và chưa có chỗ đứng thì nút đặt chỗ đứng luôn hiện.
  useEffect(() => { if (app.path === '/ban-do/dat' && !app.origin) setPlacing(true) }, [app.path])
  const [undoStanding, setUndoStanding] = useState<(() => void) | null>(null)
  const place = (point: { lat: number; lng: number }) => {
    const previous = app.standing
    const spot = standingFromTap(point)
    setPlacing(false)
    if (app.path === '/ban-do/dat') app.navigate('/ban-do')
    if (!spot) return
    app.setStanding(spot); setMessage(copy.standing.saved)
    setUndoStanding(() => previous ? () => app.setStanding(previous) : () => app.clearStanding())
  }
  const frame = useMemo(() => app.origin ? nearSummary({ origin: app.origin, places: visible, areas: cityAreas }) : null,
    [app.origin?.lat, app.origin?.lng, visible, cityAreas])
  const fit: MapFit | null = useMemo(() => frame && app.origin ? { points: framePoints(app.origin, frame), n: `${app.origin.lat},${app.origin.lng}` } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.origin?.lat, app.origin?.lng, frame])
  const suggestAround = () => { if (!app.origin) return; app.setWhere({ lat: app.origin.lat, lng: app.origin.lng }); app.navigate('/') }
  const previousView = useRef<typeof viewBounds>(null)
  const swapColumn = (change: () => void) => {
    if (!areaDocked || !document.startViewTransition) return change()
    document.startViewTransition(() => flushSync(change))
  }
  const chooseArea = (item: Area) => swapColumn(() => { if (!areaSheetId) previousView.current = viewBounds; setAreaId(item.id); setAreaSheetId(item.id); setSheetId(null); setInfoOpen(false); setQuery(''); flyTo(item.lat, item.lng, 16) })
  const chooseMapArea = (id: string) => {
    const item = cityAreas.find(area => area.id === id)
    if (!item) return
    chooseArea(item)

  }
  const closeArea = () => swapColumn(() => {
    setAreaId(null); setSheetId(null); setInfoOpen(false)
    const view = previousView.current; if (view) flyTo((view.north + view.south)/2, (view.east + view.west)/2, view.zoom || 15)
    setAreaSheetId(null)
  })
  const frameIds = useMemo(() => new Set(framePlaces.map(place => place.id)), [framePlaces])
  const framedSorted = useMemo(() => sorted.filter(place => frameIds.has(place.id)), [sorted, frameIds])
  useEffect(() => {
    if (previousCity.current !== app.city) { previousCity.current = app.city; setViewBounds(null) }
  }, [app.city])
  useEffect(() => {
    if (!sheetId) return
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>('.area-sheet-list [data-selected],.map-list [data-selected]')
      const list = card?.closest<HTMLElement>('.area-sheet-list,.scroll-viewport')
      if (!card || !list) return
      const item = card.getBoundingClientRect(), frame = list.getBoundingClientRect()
      list.scrollTop += item.top < frame.top ? item.top - frame.top : Math.max(0, item.bottom - frame.bottom)
    })
  }, [sheetId, framedSorted.length])
  useEffect(() => {
    if (queryArea) setAreaId(queryArea)
    if (!queryPlace) return
    const place = store.getPlace(queryPlace)
    if (!place || !mappable(place)) return
    const target = mapTarget(place, cityAreas)
    if (!target) return
    setOn([place.group])
    flyTo(target.lat, target.lng, 18)
    setSheetId(place.id); setInfoOpen(true)
    requestAnimationFrame(() => window.scrollTo(0, 0))
  }, [queryPlace, queryArea, state.catalog, state.custom_places, cityAreas])
  const choosePlace = (place: Place) => {
    setActiveSuggestion(-1)
    setSuggestionsOpen(false)
    setQuery('')
    const target = mapTarget(place, cityAreas)
    if (target) flyTo(target.lat, target.lng, 18)
    open(place.id)
  }
  const list = viewBounds === null ? null : !framedSorted.length && !area ? <EmptyState>{copy.noPlaces}</EmptyState> : !framedSorted.length ? <EmptyState>{copy.collection.empty}</EmptyState>
    : <div className="map-list" key={framedSorted.map(place => place.id).join(",")}>{framedSorted.map(place => <PlaceRow key={place.id} place={place} origin={listOrigin} area={place.areaId ? cityAreas.find(item => item.id === place.areaId) : null} selected={place.id === sheetId} source="map" />)}</div>
  const frameCount = framePlaces.length
  const areaSheet = areaSheetArea && <Sheet back headingEnd={<span className="area-sheet-count" data-count={areaSheetPlaces.length}>{formatAreaCount(areaSheetPlaces.length, copy.places)}</span>} open={!!areaSheetId} docked returnFocus={`.map-area-pin-wrap[data-area-id="${areaSheetArea.id}"]`} className="area-sheet" focus=".area-sheet-list a" onClose={closeArea} title={areaSheetArea.name} titleProps={{ 'data-area-name': true }} dialogProps={{ 'data-sheet': 'noi-chua', 'data-area-id': areaSheetArea.id }}>
    <span className="area-sheet-handle" aria-hidden="true" />
    <div className="area-sheet-summary">
      {areaSheetArea.address && <p className="small" data-place-field="address">{areaSheetArea.address}</p>}
    </div>
    <div className="area-sheet-list" onClick={event => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-place-id]'); if (card?.dataset.placeId) { event.preventDefault(); open(card.dataset.placeId) } }}>{areaSheetPlaces.map(place => <PlaceRow key={place.id} place={place} origin={app.origin} area={areaSheetArea} showArea={false} selected={sheetId === place.id} source="map" />)}{areaSheetPlaces.length < 4 && <button className="around-link" onClick={() => { setAreaId(null); setAreaSheetId(null); setSheetId(null) }}>Xem chỗ quanh đây</button>}</div>
  </Sheet>
  const banner = area && <div className="area-banner"><a href={`#/khu/${encodeURIComponent(area.id)}?from=map`}><strong data-name data-area-name>{area.name}</strong><Icon name="arrow" /></a><Button className="icon-button" aria-label={copy.close} icon="close" onClick={() => setAreaId(null)} /></div>

  return <main data-screen="ban-do" className="map-screen">
    <div className="map-side">
      <div className="map-search">
        <label className="search-box"><SearchIcon /><input type="text" inputMode="search" autoComplete="off" value={query} placeholder={copy.mapFields.search} aria-label={copy.mapFields.search} aria-autocomplete="list" aria-controls="map-search-results" aria-expanded={!!found && suggestionsOpen} aria-activedescendant={activeSuggestion >= 0 ? `map-search-option-${activeSuggestion}` : undefined} onChange={event => { setQuery(event.target.value); setActiveSuggestion(-1); setSuggestionsOpen(true) }} onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestionCount) { event.preventDefault(); setActiveSuggestion(index => (index + 1) % suggestionCount) }
          else if (event.key === 'ArrowUp' && suggestionCount) { event.preventDefault(); setActiveSuggestion(index => index < 0 ? suggestionCount - 1 : (index + suggestionCount - 1) % suggestionCount) }
          else if (event.key === 'Enter' && found && suggestionCount) { event.preventDefault(); const index = activeSuggestion < 0 ? 0 : activeSuggestion; if (index < areaMatches.length) chooseArea(areaMatches[index]); else choosePlace(placeMatches[index - areaMatches.length]) }
          else if (event.key === 'Escape' && found) { event.preventDefault(); setSuggestionsOpen(false); setActiveSuggestion(-1) }
        }} /></label>
        {found && suggestionsOpen && <div id="map-search-results" className="search-results" data-region="search-results">
          {areaMatches.map((item, index) => <button type="button" id={`map-search-option-${index}`} aria-current={activeSuggestion === index ? 'true' : undefined} key={item.id} className="search-row" data-area-id={item.id} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => chooseArea(item)}><Icon name="map" /><span data-name data-area-name>{item.name}</span></button>)}
          {placeMatches.map((place, index) => { const option = areaMatches.length + index; return <button type="button" id={`map-search-option-${option}`} aria-current={activeSuggestion === option ? 'true' : undefined} key={place.id} className="search-row" data-place-id={place.id} onMouseEnter={() => setActiveSuggestion(option)} onClick={() => choosePlace(place)}><Icon name={place.group} /><span data-name data-place-name>{place.name}</span></button> })}
          {!areaMatches.length && !placeMatches.length && <p className="search-empty" role="status">{noMatch}</p>}
        </div>}
      </div>
      <div className="map-groups" aria-label={copy.chooseGroup}>{groups.map(group => <Chip key={group} className="chip" data-group={group} selected={on.includes(group)} onClick={() => setOn([group])}><Icon name={group} /><span>{copy.groups[group]}</span></Chip>)}</div>
      {!areaSheet && banner}
      {areaDocked && areaSheet ? areaSheet : !areaSheet && window.innerWidth >= 600 && <><p key={frameCount} className="map-frame-count">{frameCount} {copy.places} trong khung</p><ScrollArea className="map-list-area">{list}</ScrollArea></>}
    </div>
    <div className={`map-stage${infoOpen && selected ? ' has-info' : ''}`}>
      <div className="map-area">
        <MapView pins={pins} origin={app.origin} fly={fly} center={area ? { lat: area.lat, lng: area.lng } : null} cityCenter={CITY_CENTERS[app.city]} cityBounds={cityBounds} selectedId={areaSheetId || infoOpen ? sheetId : null} onSelect={open} onAreaSelect={chooseMapArea} onTiles={setTilesOk} onViewChange={setViewBounds} placing={placing} onPlace={place} fit={fit} />
        {placing && <p className="map-placing-hint" data-placing-hint role="status">{copy.standing.tap}</p>}
        {(!tilesOk || message) && <div className={`map-notice ${message ? '' : 'is-offline'}`} role="status"><span>{message || copy.mapFields.offline}</span>{message && undoStanding && <Button data-action="hoan-tac-cho-dung" onClick={() => { undoStanding(); setUndoStanding(null); setMessage('') }}>{copy.standing.undo}</Button>}</div>}
        <Sheet open={infoOpen && !!selected} docked returnFocus={selected ? `.map-pin-wrap [data-pin][data-place-id="${selected.id}"]` : undefined} onClose={() => setInfoOpen(false)} title={selected?.name || ''} titleProps={{ 'data-place-name': true }}>
          {infoOpen && selected && <div className="map-info" data-card data-place-id={selected.id}>
            <p className="small map-info-meta"><KindLine place={selected} />{selectedDistance !== null && <span data-distance={selectedDistance}>{formatDistance(selectedDistance, selected.geo)}</span>}</p>
            {(selectedArea || selected.floor || selected.hours) && <p className="small map-info-location">{selectedArea && <span data-area-name>{selectedArea.name}</span>}{selected.floor && <span data-place-field="floor">{floorLabel(selected.floor)}</span>}<HoursLine place={selected} /></p>}
            <div className="badges">{badges(selected).map(name => <Badge key={name} name={name} />)}</div>
            <div className="map-info-actions"><a className="button secondary" data-action="xem-cho" href={`#/cho/${encodeURIComponent(selected.id)}?from=map`}>{seeLabel}</a><a className="button primary" data-action="chi-duong" href={selected.mapsUrl} target="_blank" rel="noopener noreferrer">{copy.direction}</a></div>
          </div>}
        </Sheet>
        {!areaDocked && areaSheet}
      </div>
     <div className="map-toolbar">
        <Button className="map-near" icon="locate" data-action="gan-toi" aria-label={copy.mapFields.near} onClick={() => void locate()} disabled={locating} />
      </div>
    </div>
    {!areaDocked && <div className={`map-drawer${drawerOpen ? ' is-open' : ''}`} data-map-drawer data-drawer aria-expanded={drawerOpen}>
      <button type="button" className="map-drawer-toggle" aria-label={`${frameCount} ${copy.places} trong khung`} aria-expanded={drawerOpen} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.startY = String(event.clientY); event.currentTarget.dataset.startHeight = String(event.currentTarget.closest<HTMLElement>('.map-drawer')?.getBoundingClientRect().height ?? 0) }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const startY = Number(event.currentTarget.dataset.startY); const startHeight = Number(event.currentTarget.dataset.startHeight); const drawer = event.currentTarget.closest<HTMLElement>('.map-drawer'); if (!drawer || !Number.isFinite(startY) || !Number.isFinite(startHeight)) return; drawer.style.height = `${Math.max(52, Math.min(window.innerHeight * 0.6, startHeight + startY - event.clientY))}px` }} onPointerUp={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const delta = Number(event.currentTarget.dataset.startY) - event.clientY; const startHeight = Number(event.currentTarget.dataset.startHeight); const drawer = event.currentTarget.closest<HTMLElement>('.map-drawer'); event.currentTarget.releasePointerCapture(event.pointerId); if (drawer) drawer.style.height = ''; const openThreshold = Math.max(72, Math.min(window.innerHeight * 0.6 - startHeight, 300) / 2); if (Math.abs(delta) > 12) { setDrawerOpen(delta > 0 ? delta >= openThreshold : false); event.currentTarget.dataset.dragged = 'true'; const toggle = event.currentTarget; window.setTimeout(() => delete toggle.dataset.dragged, 0) } else { setDrawerOpen(open => !open); event.currentTarget.dataset.dragged = 'true'; const toggle = event.currentTarget; window.setTimeout(() => delete toggle.dataset.dragged, 0) } }} onClick={event => { if (event.currentTarget.dataset.dragged) { delete event.currentTarget.dataset.dragged; event.preventDefault(); return } setDrawerOpen(open => !open) }}><span className="map-drawer-handle" aria-hidden="true" /><span key={frameCount}>{frameCount} {copy.places} trong khung</span></button>
      {drawerOpen && <ScrollArea className="map-drawer-list">{list}</ScrollArea>}
    </div>}
  </main>
}
