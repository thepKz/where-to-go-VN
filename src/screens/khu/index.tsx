import { useState } from 'react'
import { useApp, useStore } from '../../app-context'
import { copy } from '../../copy'
import { filterAreasByCity, filterPlacesByCity, formatAreaCount, formatDate, formatDistance, formatHours, formatTime, placeNameInArea } from '../../core/index.mjs'
import type { Area, Group, Place } from '../../store'
import { AreaCount, AreaDistance, Button, Card, Chip, EmptyState, Icon, PlaceMeta, areaRows, distanceOf, sortByDistance, useWide } from '../../ui'
import './khu.css'

const groups = Object.keys(copy.groups) as Group[]
const areaMissing = 'Chưa tìm thấy khu này'
const areaEmpty = 'Khu này chưa có chỗ nào'

export default function Khu() {
  const { store, state } = useStore()
  const app = useApp()
  const places = filterPlacesByCity(store.getPlaces(), app.city, state.catalog.areas).filter(place => place.status !== 'closed')
  const areas = filterAreasByCity(state.catalog.areas, app.city)
  const area = app.id ? areas.find(item => item.id === app.id) : undefined

  if (!app.id) {
    const rows = areaRows(areas, places, app.origin)
    return <main data-screen="khu" className="khu">
      <h1>{copy.area}</h1>
      {!rows.length ? <EmptyState>{copy.noPlaces}</EmptyState> : <Card className="khu-card"><div className="khu-areas">{rows.map(({ area: item, count, meters }) => <a key={item.id} className="khu-area" href={`#/khu/${encodeURIComponent(item.id)}`} data-area-id={item.id}>
        <span className="khu-area-text"><strong data-name data-area-name>{item.name}</strong><span className="small khu-area-line">{item.district && <span data-place-field="area">{item.district}</span>}<AreaDistance meters={meters} /></span></span><span className="area-tail"><AreaCount count={count} /><Icon name="arrow" /></span>
      </a>)}</div></Card>}
    </main>
  }
  if (!area) return <main data-screen="khu" className="khu"><EmptyState action={<Button onClick={() => app.navigate('/khu')}>{copy.area}</Button>}>{areaMissing}</EmptyState></main>

  return <KhuArea area={area} places={places.filter(place => place.areaId === area.id)} />
}

function KhuArea({ area, places }: { area: Area; places: Place[] }) {
  const areaName = area.name
  const app = useApp()
  const wide = useWide()
  const present = groups.filter(group => places.some(place => place.group === group))
  const [picked, setPicked] = useState<Group | null>(null)
  const shown = picked && present.includes(picked) ? picked : present.includes(app.group) ? app.group : present[0]
  // Mọi chỗ cùng một khoảng cách ghi ra (cùng mức khu) thì ghi một lần ở đầu trang, không lặp ở từng hàng.
  const labels = places.map(place => { const meters = distanceOf(app.origin, place); return meters === null ? null : formatDistance(meters, place.geo) })
  const once = places.length > 1 && labels.every(text => text !== null && text === labels[0])
  const toArea = once ? distanceOf(app.origin, places[0]) : null
  const order = (list: Place[]) => sortByDistance(list, app.origin, place => place)
  const areaHours = area.hoursText?.replace(/\b\d{1,2}:\d{2}\b/g, formatTime) || formatHours(area.hours || null)
  return <main data-screen="khu" className="khu khu-split">
    <div className="khu-head">
      <h1 data-name data-area-name>{areaName}</h1>
      <p className="small khu-head-line"><span>{formatAreaCount(places.length, copy.places)}</span>{toArea !== null && <span data-distance={Math.round(toArea)}>{labels[0]}</span>}</p>
      {(area.address || areaHours) && <div className="khu-facts">{area.address && <span data-place-field="address">{area.address}</span>}{areaHours && <span data-place-field="hours">{areaHours}</span>}</div>}
      <div className="khu-navigation"><a className="button primary" data-action="xem-tren-ban-do" aria-label={`Xem ${area.name} trên bản đồ`} href={`#/ban-do?khu=${encodeURIComponent(area.id)}`}><Icon name="map" />Bản đồ</a><a className="button secondary" data-action="chi-duong" href={`https://www.google.com/maps/dir/?api=1&destination=${area.lat},${area.lng}`} target="_blank" rel="noopener noreferrer"><Icon name="arrow" />Chỉ đường</a></div>
    </div>
    {!places.length ? <EmptyState action={<Button onClick={() => app.navigate('/khu')}>{copy.area}</Button>}>{areaEmpty}</EmptyState> : <section className="khu-here stack" aria-labelledby="khu-here">
      <h2 id="khu-here" className="khu-label">{copy.mapFields.here}</h2>
      {!wide && <div className="khu-tabs">{present.map(group => <Chip key={group} data-group-tab={group} selected={shown === group} onClick={() => setPicked(group)}><Icon name={group} /><span>{copy.groupsInArea[group]}</span></Chip>)}</div>}
      <Card className="khu-card"><div className="khu-groups">{present.map(group => <section key={group} className="khu-group" data-group-section={group} hidden={!wide && shown !== group}>
        {wide && <h3 className="khu-group-title"><Icon name={group} />{copy.groupsInArea[group]}</h3>}
        {order(places.filter(place => place.group === group)).map(place => <KhuPlaceRow key={place.id} place={place} area={area} origin={app.origin} hideDistance={false} />)}
      </section>)}</div></Card>
    </section>}
    {area.updated && <p className="small khu-updated">{copy.detail.updated} {formatDate(area.updated)}</p>}
  </main>
}

function KhuPlaceRow({ place, area, origin, hideDistance }: { place: Place; area: Area; origin: { lat: number; lng: number } | null; hideDistance: boolean }) {
  const from = new URLSearchParams(useApp().path.split('?')[1] || '').get('from') || 'near'
  return <article className="place-row" data-card data-place-id={place.id}>
    <a className="place-row-link" href={`#/cho/${encodeURIComponent(place.id)}?from=${encodeURIComponent(from)}`}>
      <div className="place-row-text"><strong aria-label={place.name} title={place.name} data-place-name>{placeNameInArea(place, area)}</strong><PlaceMeta place={place} origin={origin} showArea={false} showDistance={!hideDistance} /></div><Icon name="arrow" />
    </a>
  </article>
}
