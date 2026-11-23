import { useMemo } from 'react'
import { copy } from '../../copy'
import { HO_GUOM } from '../../core/index.mjs'
import type { Place, Point } from '../../store'
import MapView, { type MapPin } from './map-view'

const noop = () => {}
const mappable = (place: Place) => place.geo !== 'none' && Number.isFinite(place.lat) && Number.isFinite(place.lng) && place.status !== 'closed'

/**
 * Bản đồ nhỏ cho máy bàn: dùng lại bản đồ sẵn có, chỉ để nhìn, không kéo không phóng.
 * Bấm vào đâu cũng mở tab Bản đồ. Không có tấm ghim.
 */
export default function MiniMap({ places, origin, center }: { places: Place[]; origin?: Point | null; center?: Point | null }) {
  const pins: MapPin[] = useMemo(() => places.filter(mappable).map(place => ({ id: place.id, name: place.name, group: place.group, geo: place.geo, lat: place.lat!, lng: place.lng! })), [places])
  const points: Point[] = [...pins.map(pin => ({ lat: pin.lat, lng: pin.lng })), ...(origin ? [origin] : [])]
  if (!points.length) points.push(center || HO_GUOM)
  const n = points.map(point => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|')
  const fit = useMemo(() => ({ points, n }), [n])
  return <div className="mini-map" data-mini-map>
    <MapView mini pins={pins} origin={origin ?? null} fly={null} center={null} selectedId={null} onSelect={noop} onTiles={noop} fit={fit} />
    <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{copy.mapFields.credit}</a>
    <a className="mini-map-open" href="#/ban-do" aria-label={copy.mapFields.openMap} />
  </div>
}
