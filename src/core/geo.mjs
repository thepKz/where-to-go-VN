/** @param {{lat:number,lng:number}} from @param {{lat:number,lng:number}} to */
export function distanceMeters(from, to) {
  if (!from || !to || ![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const latitude = (to.lat - from.lat) * radians;
  const longitude = (to.lng - from.lng) * radians;
  const chord = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, chord)));
}
/** @param {number|null} meters @param {string} [accuracy] */
export function roundDistance(meters, accuracy = 'exact') {
  if (meters == null || !Number.isFinite(meters) || meters < 0 || accuracy === 'none') return null;
  const step = accuracy === 'area' ? 500 : accuracy === 'street' ? 100 : meters >= 1000 ? 100 : 10;
  return Math.round(meters / step) * step;
}
export const haversine = distanceMeters;

/** Mục tiêu ghim trong ứng dụng. Chỗ chỉ biết khu dùng tâm nơi chứa. */
export function mapTarget(place, areas = []) {
  if (!place || place.status === 'closed' || place.geo === 'none') return null;
  const area = place.areaId ? areas.find(item => item.id === place.areaId) : null;
  if (place.geo === 'area') {
    return area && Number.isFinite(area.lat) && Number.isFinite(area.lng)
      ? { lat: area.lat, lng: area.lng, areaId: area.id }
      : null;
  }
  return Number.isFinite(place.lat) && Number.isFinite(place.lng)
    ? { lat: place.lat, lng: place.lng, areaId: place.areaId ?? null }
    : null;
}
