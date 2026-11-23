import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { copy } from '../../copy'
import { CITY_CENTERS, isMapTap, selectCollapsedAreaPins, shouldShowPlacePin } from '../../core/index.mjs'
import type { Group, Place, Point } from '../../store'
import { MinusIcon, PlusIcon } from './icons'

export interface MapPin { direct?: boolean; hot?: boolean; id: string; name: string; group: Group; geo: Place['geo']; lat: number; lng: number; areaId?: string; area?: boolean; count?: number }
export interface MapAreaLabel { id: string; name: string; lat: number; lng: number }
export interface MapFly { lat: number; lng: number; zoom: number; n: number }
/** Các điểm bản đồ phải phóng vừa. `n` đổi thì phóng lại. */
export interface MapFit { points: Point[]; n: number | string }
export interface MapBounds { south: number; west: number; north: number; east: number; zoom?: number }

const paths: Record<Group, string> = {
  an: '<path d="M4 13h16a8 8 0 0 1-16 0ZM8 22h8M8 3v6M12 2v7M16 3v6"/>',
  'ca-phe': '<path d="M4 8h12v6a6 6 0 0 1-12 0V8ZM16 9h2a3 3 0 0 1 0 6h-2M3 22h16M7 2v3M12 2v3"/>',
  nhau: '<path d="M5 7h12v14H5zM17 9h3v8h-3M9 11v6M13 11v6M5 7a3 3 0 0 1 1-6 3 3 0 0 1 5 0 3 3 0 0 1 5 1 3 3 0 0 1 1 5"/>',
  choi: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
}
const svg = (group: Group) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[group]}</svg>`
/** Đánh dấu ghim đang chọn bằng cả lớp kiểu dáng lẫn thuộc tính cho máy đọc. */
function mark(node: HTMLElement, selected: boolean) {
  node.classList.toggle('is-selected', selected)
  if (selected) node.setAttribute('data-pin-selected', ''); else node.removeAttribute('data-pin-selected')
}
const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches
const tileSource = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const pinSignature = (pin: MapPin) => `${pin.area ? 'area' : 'place'}:${pin.id}:${pin.lat}:${pin.lng}:${pin.group}:${pin.count ?? ''}:${pin.direct}`
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))
const areaIcon = (pin: MapPin, collapsed: boolean) => L.divIcon({
  className: 'map-area-pin-wrap',
  html: `<span class="map-area-pin ${pin.group}${collapsed ? ' is-collapsed' : ''}"><span class="map-area-name" title="${escapeHtml(pin.name)}">${escapeHtml(pin.name)}</span><span class="map-area-count" data-count="${pin.count}"></span></span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

export default function MapView({ pins, areaLabels = [], origin, fly, center, cityCenter = CITY_CENTERS['ha-noi'], cityBounds = null, selectedId, onSelect, onAreaSelect, onTiles, onViewChange, placing = false, onPlace, fit = null, mini = false }: {
  pins: MapPin[]; areaLabels?: MapAreaLabel[]; origin: Point | null; fly: MapFly | null; center: Point | null; selectedId: string | null
  cityCenter?: Point; cityBounds?: MapBounds | null
  onSelect: (id: string) => void; onAreaSelect?: (id: string) => void; onTiles: (ok: boolean) => void; onViewChange?: (bounds: MapBounds) => void
  /** Phóng vừa các điểm này (chỗ đứng và các chỗ gần nhất). */
  fit?: MapFit | null
  /** Bản đồ nhỏ chỉ để nhìn: không kéo, không phóng, không nút. */
  mini?: boolean
  /** Đang chờ người dùng chạm một điểm để đặt chỗ đứng. */
  placing?: boolean; onPlace?: (point: Point) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const group = useRef<L.MarkerClusterGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const markerPins = useRef(new Map<string, MapPin>())
  const hiddenAreaPlaces = useRef(new Set<string>())
  const hiddenAreaPins = useRef(new Set<string>())
  const collapsedAreaPins = useRef(new Set<string>())
  const here = useRef<L.Marker | null>(null)
  const labelHost = useRef<HTMLDivElement>(null)
  const clicked = useRef<string | null>(null)
  const longPressFired = useRef(false)
  const latest = useRef({ pins, areaLabels, onSelect, onAreaSelect, onTiles, onViewChange, center, cityCenter, cityBounds, origin, placing, onPlace, fit })
  latest.current = { pins, areaLabels, onSelect, onAreaSelect, onTiles, onViewChange, center, cityCenter, cityBounds, origin, placing, onPlace, fit }
  const centered = useRef(false)
  const [ready, setReady] = useState(false)
  const key = pins.map(pinSignature).join('|')
  const stepZoom = useRef<(delta: number) => void>(() => {})
  const fitTo = (points: Point[]) => {
    const instance = map.current
    if (!instance || !points.length) return
    instance.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lng] as L.LatLngTuple)), { paddingTopLeft: mini ? [40, 40] : [48, 48], paddingBottomRight: mini ? [40, 64] : [72, 64], maxZoom: 15, animate: motion(), duration: .4 })
  }

  useEffect(() => {
    const element = host.current!
    let alive = true
    const still = mini ? { dragging: true, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false } : {}
    const bounds = latest.current.cityBounds
    const instance = L.map(element, { zoomControl: false, attributionControl: false, center: [latest.current.cityCenter.lat, latest.current.cityCenter.lng], zoom: 15, minZoom: 11, maxZoom: 19, maxBounds: bounds ? L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]) : undefined, maxBoundsViscosity: 0.8, inertiaDeceleration: 4000, inertiaMaxSpeed: 500, zoomSnap: 1, touchZoom: true, scrollWheelZoom: false, wheelPxPerZoomLevel: 120, zoomAnimation: motion(), markerZoomAnimation: motion(), fadeAnimation: false, ...still })
    class StreetTiles extends L.GridLayer {
      protected createTile(coords: L.Coords, done: L.DoneCallback) {
        const image = new Image(256, 256)
        image.alt = ''
        image.onload = () => done(undefined, image)
        image.onerror = () => done(new Error('tile'), image)
        image.src = L.Util.template(tileSource, coords)
        return image
      }
    }
    const tiles = new StreetTiles({ maxZoom: 19, keepBuffer: 3, updateWhenIdle: false })
    tiles.on('tileerror', () => { if (alive) latest.current.onTiles(false) })
    tiles.on('tileload', () => { if (alive) latest.current.onTiles(true) })
    tiles.addTo(instance)
    const backing = L.layerGroup()
    let retiring = 0
    const restoreBacking = () => { clearTimeout(retiring); if (!mini) backing.addTo(instance) }
    if (!mini) {
      restoreBacking()
      const level = 10, margin = instance.getSize().divideBy(4)
      const limits = bounds ? L.latLngBounds([bounds.south,bounds.west],[bounds.north,bounds.east]) : instance.getBounds()
      const first = instance.project(limits.getNorthWest(), level).subtract(margin).divideBy(256).floor()
      const last = instance.project(limits.getSouthEast(), level).add(margin).divideBy(256).floor()
      for (let x = first.x; x <= last.x; x++) for (let y = first.y; y <= last.y; y++) {
        const corner = L.point(x, y).multiplyBy(256)
        L.imageOverlay(L.Util.template(tileSource, {z: level, x, y}), L.latLngBounds(instance.unproject(corner, level), instance.unproject(corner.add([256,256]), level)), {pane:'tilePane', zIndex:0, className:'map-backing leaflet-tile'}).on('load', event => event.target.getElement().classList.add('leaflet-tile-loaded')).addTo(backing)
      }
      const retire = () => {
        clearTimeout(retiring)
        retiring = window.setTimeout(() => { if (!tiles.isLoading() && !element.querySelector('.leaflet-zoom-anim') && !element.classList.contains('leaflet-zoom-anim')) backing.remove() }, 80)
      }
      tiles.on('load', retire)
      instance.on('moveend', retire)
    }
    let target: number | null = null
    const advance = () => {
      if (target === null) return
      if (target === instance.getZoom()) target = null
      else {
        if (target < instance.getZoom()) restoreBacking()
        instance.setZoom(target)
      }
    }
    instance.on('zoomend', () => queueMicrotask(() => { if (alive) advance() }))
    instance.on('dragstart touchstart', () => { target = null })
    stepZoom.current = delta => {
      const moving = target !== null
      target = Math.min(instance.getMaxZoom(), Math.max(instance.getMinZoom(), (target ?? instance.getZoom()) + delta))
      if (!moving) advance()
    }
    let lastWheel = -Infinity
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); if (!event.deltaY || event.timeStamp - lastWheel < 40) return
      lastWheel = event.timeStamp; stepZoom.current(-Math.sign(event.deltaY))
    }
    if (!mini) element.addEventListener('wheel', wheel, { passive: false })
    const cluster = L.markerClusterGroup({
       showCoverageOnHover: false, animate: false, animateAddingMarkers: false, chunkedLoading: false, chunkInterval: 80, chunkDelay: 0, removeOutsideVisibleBounds: true, maxClusterRadius: mini ? 36 : innerWidth < 600 ? 34 : 30, spiderfyOnMaxZoom: true,
      iconCreateFunction: item => L.divIcon({ className: 'map-cluster-wrap', html: `<span class="map-cluster ${markerPins.current.get((item.getAllChildMarkers()[0].options as L.MarkerOptions).title || '')?.group || 'an'}" style="--size:${item.getChildCount() < 5 ? 28 : item.getChildCount() < 15 ? 34 : 40}px" data-count="${item.getChildCount()}"><span aria-hidden="true"></span></span>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
    })
    instance.addLayer(cluster)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const syncInertia = () => { instance.options.inertia = !reduced.matches }
    syncInertia(); reduced.addEventListener('change', syncInertia)
    const observer = new MutationObserver(() => {
      element.querySelectorAll<HTMLElement>('.map-cluster-wrap:not([data-cluster])').forEach(node => {
        node.setAttribute('data-cluster', '')
        node.setAttribute('aria-label', `${node.querySelector<HTMLElement>('[data-count]')?.dataset.count} ${copy.places}`)
      })
    })
    observer.observe(element, { childList: true, subtree: true })
    const resize = new ResizeObserver(() => { if (alive && element.isConnected) instance.invalidateSize() })
    resize.observe(element)
    let pointerDown: { x: number; y: number; time: number; id: number } | null = null
    const clearPointer = () => { pointerDown = null }
    const onPointerDown = (event: PointerEvent) => {
      clearPointer()
      if ((!event.isPrimary && event.pointerType === 'touch') || event.shiftKey) restoreBacking()
      if (event.isPrimary && event.button === 0 && latest.current.onPlace && !(event.target as HTMLElement).closest('.leaflet-control,.leaflet-marker-icon'))
        pointerDown = {x:event.clientX, y:event.clientY, time:event.timeStamp, id:event.pointerId}
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerDown && !isMapTap(pointerDown, {x:event.clientX, y:event.clientY})) clearPointer()
    }
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerDown
      clearPointer()
      if (!start || event.pointerId !== start.id || event.timeStamp-start.time < 500 || !isMapTap(start,{x:event.clientX,y:event.clientY})) return
      const point = instance.mouseEventToLatLng(event)
      longPressFired.current = true
      window.setTimeout(() => { longPressFired.current = false }, 750)
      centered.current = true
      latest.current.onPlace?.({lat:point.lat,lng:point.lng})
    }
    instance.on('dragstart zoomstart', clearPointer)
    element.addEventListener('wheel', clearPointer, true)
    element.addEventListener('pointerdown', onPointerDown, true)
    element.addEventListener('pointermove', onPointerMove, true)
    element.addEventListener('pointerup', onPointerUp, true)
    element.addEventListener('pointercancel', clearPointer, true)
    const offline = () => latest.current.onTiles(false)
    addEventListener('offline', offline)
    if (!navigator.onLine) offline()
    map.current = instance; group.current = cluster; setReady(true)
    return () => {
      clearTimeout(retiring); element.removeEventListener('wheel', wheel); element.removeEventListener('wheel', clearPointer, true); reduced.removeEventListener('change', syncInertia); alive = false; removeEventListener('offline', offline); resize.disconnect(); observer.disconnect(); element.removeEventListener('pointerdown', onPointerDown, true); element.removeEventListener('pointermove', onPointerMove, true); element.removeEventListener('pointerup', onPointerUp, true); element.removeEventListener('pointercancel', clearPointer, true); clearPointer()
      try { here.current?.remove(); instance.stop(); instance.remove() } catch {}
      map.current = null; group.current = null; markers.current.clear(); markerPins.current.clear(); hiddenAreaPlaces.current.clear(); hiddenAreaPins.current.clear(); collapsedAreaPins.current.clear(); here.current = null
    }
  }, [])

  useEffect(() => {
    const instance = map.current, cluster = group.current
    if (!ready || !instance || !cluster) return
    let alive = true
    let rafId = 0
    let viewTimer = 0
    const element = host.current!
    const syncAreaPlaces = () => {
      const zoom = instance.getZoom()
      markers.current.forEach((marker, id) => {
        const pin = markerPins.current.get(id)
        if (!pin || pin.area || pin.direct) return
        const visible = !mini || shouldShowPlacePin(pin, zoom)
        if (visible && hiddenAreaPlaces.current.has(id)) { cluster.addLayer(marker); hiddenAreaPlaces.current.delete(id) }
        if (!visible && !hiddenAreaPlaces.current.has(id)) { cluster.removeLayer(marker); hiddenAreaPlaces.current.add(id) }
      })
    }
    const syncAreaPinCollisions = () => {
      const boxes = Array.from(markers.current.entries()).flatMap(([id, marker]) => {
        const pin = markerPins.current.get(id), node = marker.getElement()
        if (!pin?.area || !node) return []
        const point = instance.latLngToContainerPoint(marker.getLatLng())
        return [{ id, count: pin.count || 0, left: point.x - 110, top: point.y - 24, width: 220, height: 48 }]
      })
      const next = new Set(selectCollapsedAreaPins(boxes))
      {
        const frame = element.getBoundingClientRect()
        const circles = Array.from(element.querySelectorAll('.map-cluster,.map-pin'), node => node.getBoundingClientRect())
        for (const box of boxes) {
          const x = frame.left + box.left, y = frame.top + box.top
          const blocked = (left: number, top: number, width: number, height: number) => circles.some(c => c.left < left + width && left < c.right && c.top < top + height && top < c.bottom)
          if (blocked(x, y, box.width, box.height)) next.add(box.id)
          const badge = markers.current.get(box.id)?.getElement()
          if (!badge) continue
          badge.style.translate = ''
          if (!next.has(box.id)) { circles.push(new DOMRect(x,y,box.width,box.height)); continue }
          const left = x + 88, top = y + 2
          const shifts = [[0, 0], ...circles.flatMap(c => [[c.right + 4 - left, 0], [c.left - 48 - left, 0], [0, c.bottom + 4 - top], [0, c.top - 48 - top]])]
          const shift = shifts.sort((a,b) => Math.hypot(...a) - Math.hypot(...b)).find(([dx,dy]) => left+dx >= frame.left && left+dx+44 <= frame.right && top+dy >= frame.top && top+dy+44 <= frame.bottom && !blocked(left+dx,top+dy,44,44))
          if (shift) { badge.style.translate = shift.map(value => value + 'px').join(' '); circles.push(new DOMRect(left+shift[0],top+shift[1],44,44)) }
        }
      }
      for (const [id, marker] of markers.current) {
        const pin = markerPins.current.get(id)
        if (!pin?.area) continue
        const collapsed = next.has(id)
        if (collapsed === collapsedAreaPins.current.has(id)) continue
        collapsed ? collapsedAreaPins.current.add(id) : collapsedAreaPins.current.delete(id)
        marker.setIcon(areaIcon(pin, collapsed))
        const node = marker.getElement()
        if (node) {
          node.setAttribute('data-area-pin', ''); node.setAttribute('data-area-id', pin.areaId || ''); node.setAttribute('data-count', String(pin.count))
          
        }
      }
    }
    const syncAreaPins = () => {
      const size = instance.getSize()
      for (const [id, marker] of markers.current) {
        const pin = markerPins.current.get(id)
        if (!pin?.area) continue
        const point = instance.latLngToContainerPoint(marker.getLatLng())
        const visible = point.x >= 0 && point.x <= size.x && point.y >= 0 && point.y <= size.y
        if (visible && hiddenAreaPins.current.has(id)) { marker.addTo(instance); hiddenAreaPins.current.delete(id) }
        if (!visible && !hiddenAreaPins.current.has(id)) { marker.remove(); hiddenAreaPins.current.add(id); collapsedAreaPins.current.delete(id) }
      }
      syncAreaPinCollisions()
    }
    const next = new Map(latest.current.pins.map(pin => [pin.id, pin]))
    const fading = document.createElement('div')
    fading.setAttribute('aria-hidden', 'true'); fading.inert = true; fading.style.pointerEvents = 'none'
    if (motion() && latest.current.center && !mini) for (const el of host.current?.querySelectorAll('.map-cluster-wrap') || []) fading.append(el.cloneNode(true))
    for (const [id, marker] of markers.current) {
      const nextPin = next.get(id)
      if (nextPin && pinSignature(nextPin) === pinSignature(markerPins.current.get(id)!)) continue
      const old = marker.getElement()
      if (old && !mini && motion() && !nextPin) {
        const ghost = old.cloneNode(true) as HTMLElement
        ghost.removeAttribute('tabindex'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true
        ghost.querySelectorAll('*').forEach(child => { for (const attr of child.getAttributeNames()) if (attr.startsWith('data-')) child.removeAttribute(attr) }); for (const attr of ghost.getAttributeNames()) if (attr.startsWith('data-')) ghost.removeAttribute(attr)
        fading.append(ghost)
      }
      if (markerPins.current.get(id)?.area || markerPins.current.get(id)?.direct) marker.remove(); else cluster.removeLayer(marker)
      markers.current.delete(id)
      markerPins.current.delete(id)
      hiddenAreaPlaces.current.delete(id)
      hiddenAreaPins.current.delete(id)
      collapsedAreaPins.current.delete(id)
    }
    const created: L.Marker[] = []
    if (fading.childElementCount) { instance.getPane('markerPane')?.append(fading); fading.animate([{opacity:0.99},{opacity:0}],400).finished.then(()=>fading.remove()) }
    const createdAreas: L.Marker[] = []
    for (const pin of latest.current.pins) {
      if (markers.current.has(pin.id)) continue
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pin.area
          ? areaIcon(pin, false)
          : L.divIcon({ className: 'map-pin-wrap', html: `<span class="map-pin ${pin.hot ? 'hot' : ''} ${pin.group} ${pin.geo}" data-pin data-place-id="${pin.id}"${pin.areaId ? ` data-area-id="${pin.areaId}"` : ''}>${svg(pin.group)}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: pin.id, autoPanOnFocus: false, keyboard: true, interactive: true, bubblingMouseEvents: true, riseOnHover: true, zIndexOffset: pin.area ? 1000 : 0,
      })
      marker.on('add', () => {
        const node = marker.getElement()
        if (!node) return
        node.style.setProperty('--delay', `${Math.min(created.length, 12) * 20}ms`)
        const focusTarget = pin.area ? node : node.querySelector<HTMLElement>('[data-pin]') || node
        node.onpointerdown = event => { if (event.button === 0) node.setPointerCapture(event.pointerId) }
        node.setAttribute('aria-label', pin.area ? `${pin.name}, ${pin.count} chỗ` : `Chọn ${pin.name}`)
        node.tabIndex = 0
        focusTarget.setAttribute('aria-label', pin.area ? `${pin.name}, ${pin.count} chỗ` : `Chọn ${pin.name}`)
        if (focusTarget !== node) focusTarget.tabIndex = -1
        if (pin.area) {
          node.setAttribute('data-area-pin', ''); node.setAttribute('data-area-id', pin.areaId || ''); node.setAttribute('data-count', String(pin.count))
        } else {
          node.setAttribute('data-place-id', pin.id)
          if (pin.areaId) node.setAttribute('data-area-id', pin.areaId)
          mark(node, pin.id === selectedRef.current)
        }
      })
      marker.on('click', event => {
        if (longPressFired.current) { longPressFired.current = false; return }
        if (latest.current.placing) return
        if (mini && event.originalEvent?.detail) {
          const point = instance.mouseEventToContainerPoint(event.originalEvent)
          let closest = pin, distance = Infinity
          for (const [id, candidate] of markers.current) {
            if (!candidate.getElement()?.isConnected || markerPins.current.get(id)?.area) continue
            const delta = instance.latLngToContainerPoint(candidate.getLatLng()).distanceTo(point)
            if (delta < distance) { distance = delta; closest = markerPins.current.get(id)! }
          }
          if (distance <= 16) { latest.current.onSelect(closest.id); return }
        }
        if (pin.area) {
          const opener = marker.getElement()
          host.current?.querySelectorAll<HTMLElement>('[data-sheet-opener]').forEach(node => node.removeAttribute('data-sheet-opener'))
          opener?.setAttribute('data-sheet-opener', '')
          opener?.focus({ preventScroll: true })
          latest.current.onAreaSelect?.(pin.areaId || pin.id.replace(/^area:/, ''))
          return
        }
        clicked.current = pin.id
        const opener = marker.getElement()
        const focusTarget = opener?.querySelector<HTMLElement>('[data-pin]') || opener
        host.current?.querySelectorAll<HTMLElement>('[data-sheet-opener]').forEach(node => node.removeAttribute('data-sheet-opener'))
        focusTarget?.setAttribute('data-sheet-opener', '')
        focusTarget?.focus({ preventScroll: true })
        latest.current.onSelect(pin.id)
      })
      markers.current.set(pin.id, marker)
      markerPins.current.set(pin.id, pin)
      if (pin.area || pin.direct) createdAreas.push(marker); else created.push(marker)
    }
    if (created.length) cluster.addLayers(created)
    if (createdAreas.length) createdAreas.forEach(marker => marker.addTo(instance))
    instance.on('zoomend', syncAreaPlaces)
    const reportView = () => { host.current?.classList.toggle('far-view', instance.getZoom() < 16); const bounds = instance.getBounds(); latest.current.onViewChange?.({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(), zoom: instance.getZoom() }) }
    instance.on('moveend zoomend', syncAreaPins); cluster.on('animationend', syncAreaPins)
    host.current?.classList.toggle('far-view', instance.getZoom() < 16)
    instance.on('moveend zoomend', reportView)
    syncAreaPlaces()
    rafId = requestAnimationFrame(() => { if (alive && host.current?.isConnected) { syncAreaPins(); reportView() } })
    const { origin: home, center: area, fit: frame } = latest.current
    if (!centered.current && !area && frame?.points.length) { centered.current = true; fitTo(frame.points) }
    // Có vị trí và không đang xem một khu thì mở quanh vị trí đó, không thu cả thành phố vào khung.
    if (!area && home) { if (!centered.current) { centered.current = true; instance.setView([home.lat, home.lng], 15) } }
    
    viewTimer = window.setTimeout(() => { if (alive && host.current?.isConnected) { syncAreaPins(); reportView() } }, mini ? 480 : 120)
    return () => { alive = false; cancelAnimationFrame(rafId); window.clearTimeout(viewTimer); instance.off('zoomend', syncAreaPlaces); instance.off('moveend zoomend', syncAreaPins); cluster.off('animationend', syncAreaPins); instance.off('moveend zoomend', reportView) }
  }, [ready, key])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return
    const bounds = cityBounds ? L.latLngBounds([cityBounds.south, cityBounds.west], [cityBounds.north, cityBounds.east]) : null
    instance.setMaxBounds(bounds || undefined)
    centered.current = false
    if (!latest.current.fit && !latest.current.origin && !latest.current.center) instance.setView([cityCenter.lat, cityCenter.lng], 15, { animate: false })
  }, [ready, cityBounds?.south, cityBounds?.west, cityBounds?.north, cityBounds?.east, cityCenter.lat, cityCenter.lng])

  const selectedRef = useRef<string | null>(selectedId)
  useEffect(() => {
    selectedRef.current = selectedId
    markers.current.forEach((marker, id) => { const node = marker.getElement(); marker.setZIndexOffset(id === selectedId ? 20000 : id.startsWith("area:") ? 1000 : 0); if (node) mark(node, id === selectedId) })
    const instance = map.current, marker = selectedId ? markers.current.get(selectedId) : undefined
    if (!ready || !instance || !marker) return
    let alive = true
    const frames: number[] = []
    // Ghim đang chọn phải còn thấy và nằm trên tấm, nhưng không đổi layer để giữ thứ tự DOM.
    const reveal = () => {
      if (latest.current.center) { if (!instance.getBounds().contains(marker.getLatLng())) instance.panTo(marker.getLatLng(), {animate:motion()}); return }
      {
      if (!alive || !map.current || !host.current?.isConnected) return
      const frame = host.current.getBoundingClientRect(), size = instance.getSize()
      const point = instance.latLngToContainerPoint(marker.getLatLng())
      const obstacles = Array.from(host.current!.closest('.map-screen')!.querySelectorAll<HTMLElement>('dialog[open], .map-side > *, .map-drawer, .map-notice, .map-toolbar, .leaflet-control'), node => node.getBoundingClientRect()).filter(box => box.width && box.height)
      const free = (x: number, y: number) => x >= 24 && y >= 24 && x <= size.x - 24 && y <= size.y - 24 && obstacles.every(box => frame.left + x < box.left - 24 || frame.left + x > box.right + 24 || frame.top + y < box.top - 24 || frame.top + y > box.bottom + 24)
      if (!free(point.x, point.y)) {
        let best: L.Point | undefined
        for (let y = 24; y <= size.y - 24; y += 24) for (let x = 24; x <= size.x - 24; x += 24) {
          const candidate = L.point(x, y)
          if (free(x, y) && (!best || candidate.distanceTo(point) < best.distanceTo(point))) best = candidate
        }
        if (best) instance.panBy(point.subtract(best), { animate: false })
      }
      }
    }
    const show = () => { const node = marker.getElement(); if (node) mark(node, true); reveal() }
    marker.setZIndexOffset(20000)
    reveal()
    const timers = [0, 700, 1500, 2500].map(delay => window.setTimeout(show, delay))
    return () => { alive = false; timers.forEach(timer => window.clearTimeout(timer)); frames.forEach(cancelAnimationFrame) }
  }, [selectedId, key, ready, fly?.n])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return
    if (here.current) { try { here.current.remove() } catch {} }
    here.current = null
    if (!origin) return
    if (!host.current?.isConnected) return
    if (!centered.current && !latest.current.center) { centered.current = true; instance.setView([origin.lat, origin.lng], 15) }
    here.current = L.marker([origin.lat, origin.lng], { zIndexOffset: mini ? 10000 : 0, icon: L.divIcon({ className: 'map-here-wrap', html: mini ? '<span class="map-here" data-me-mini aria-hidden="true"></span>' : `<span class="map-here" data-me role="img" aria-label="${copy.mapFields.me}"></span>`, iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: false, keyboard: false }).addTo(instance)
  }, [ready, origin?.lat, origin?.lng])

  useEffect(() => {
    if (ready && fit?.points.length) { centered.current = true; fitTo(fit.points) }
  }, [ready, fit?.n])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || mini) return
    const render = () => {
      const layer = labelHost.current
      if (!layer) return
      layer.replaceChildren()
      if (instance.getZoom() < 15) return
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.map-search,.map-groups,.map-toolbar,.map-zoom,.map-stand,.map-stand-card,.map-placing-hint,dialog[open]'))
      const overlaps = (left: number, top: number, width: number, height: number) => overlays.some(node => {
        const box = node.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && left < box.right && left + width > box.left && top < box.bottom && top + height > box.top
      })
      for (const area of latest.current.areaLabels) {
        if (!instance.getBounds().contains([area.lat, area.lng])) continue
        const point = instance.latLngToContainerPoint([area.lat, area.lng])
        if (point.x < 0 || point.y < 0 || point.x > layer.clientWidth || point.y > layer.clientHeight) continue
        const label = document.createElement('span')
        label.className = 'map-area-label'
        label.dataset.areaName = ''
        label.textContent = area.name
        layer.append(label)
        const left = Math.max(4, Math.min(layer.clientWidth - label.offsetWidth - 4, point.x + 12))
        const top = Math.max(4, Math.min(layer.clientHeight - label.offsetHeight - 4, point.y - 12))
        if (left < 8 || top < 8 || left + label.offsetWidth > layer.clientWidth - 8 || top + label.offsetHeight > layer.clientHeight - 64) { label.remove(); continue }
        label.style.left = `${left}px`
        label.style.top = `${top}px`
        const box = label.getBoundingClientRect()
        if (overlaps(box.left, box.top, box.width, box.height)) { label.remove(); continue }
      }
    }
    instance.on('zoomend moveend', render); render()
    const frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); instance.off('zoomend moveend', render); labelHost.current?.replaceChildren() }
  }, [ready, mini, areaLabels.length, selectedId])

  useEffect(() => {
    if (ready && fly && map.current && host.current?.isConnected) { map.current.stop(); map.current.flyTo([fly.lat, fly.lng], fly.zoom, { animate: motion(), duration: .4 }) }
  }, [ready, fly?.n])

  // Đang đặt chỗ đứng thì cụm số không phóng vào khi chạm.
  useEffect(() => {
    const cluster = group.current
    if (!cluster) return
    const options = cluster.options as L.MarkerClusterGroupOptions
    options.zoomToBoundsOnClick = !placing
    options.spiderfyOnMaxZoom = !placing
  }, [placing, ready])

  return <div className={`map-frame${placing ? ' is-placing' : ''}${mini ? ' is-mini' : ''}`}>
    <div ref={host} className="map-canvas" />
    {!mini && <div ref={labelHost} className="map-label-layer" aria-hidden="true" />}
    {!mini && <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{copy.mapFields.credit}</a>}
    {!mini && <div className="map-zoom">
      <button type="button" className="button map-tool" data-action="zoom-in" aria-label="Phóng to" onClick={() => stepZoom.current(1)}><PlusIcon /></button>
      <button type="button" className="button map-tool" data-action="zoom-out" aria-label="Thu nhỏ" onClick={() => stepZoom.current(-1)}><MinusIcon /></button>
    </div>}
  </div>
}
