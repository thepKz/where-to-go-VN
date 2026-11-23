import { distanceMeters } from './geo.mjs';
const DEFAULT_CITY = 'ha-noi';
const CITY_KEYS = new Set(['ha-noi', 'ho-chi-minh']);

/** Thành phố cũ không có trường city được coi là Hà Nội. */
export function cityOfPlace(place, areas = []) {
  if (place?.city === 'ho-chi-minh') return 'ho-chi-minh';
  return DEFAULT_CITY;
}
export function cityOfArea(area) { return area?.city === 'ho-chi-minh' ? 'ho-chi-minh' : DEFAULT_CITY; }
/** Thành phố của điểm là thành phố của khu gần nhất. */
export function cityOfPoint(point, areas = []) {
  if (!point) return DEFAULT_CITY;
  const nearest = areas.map(area => ({ area, meters: distanceMeters(point, area) })).filter(row => row.meters !== null).sort((left, right) => left.meters - right.meters)[0];
  return cityOfArea(nearest?.area);
}
export function filterPlacesByCity(places, city, areas = []) {
  return places.filter(place => cityOfPlace(place, areas) === city && (!place.areaId || cityOfArea(areas.find(area => area.id === place.areaId)) === city));
}
export function filterAreasByCity(areas, city) { return areas.filter(area => cityOfArea(area) === city); }
export function catalogCities(places = [], areas = []) {
  return [...new Set([...places.map(place => cityOfPlace(place, areas)), ...areas.map(cityOfArea)])];
}
/** Lựa chọn thành phố trên máy chỉ nhận mã thành phố có thật trong dữ liệu. */
export function readCityPreference(raw, available = []) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const cities = new Set(available.length ? available : CITY_KEYS);
  return cities.has(value) ? value : null;
}
/** Khoảng cách từ điểm xuất phát tới một chỗ. Chỗ không có toạ độ đúng (geo none) hoặc chưa có điểm xuất phát thì không có khoảng cách. */
export function placeDistance(origin, place) {
  if (!origin || !place || place.geo === 'area' || place.geo === 'none' || place.lat == null || place.lng == null) return null;
  return distanceMeters(origin, { lat: place.lat, lng: place.lng });
}
/** Khoảng cách tăng dần, chỗ không có toạ độ nằm cuối, bằng nhau thì xét `tie` rồi tới tên. Không có vị trí thì xét `tie` rồi tên. */
export function sortByDistance(list, origin, placeOf, tie) {
  const byName = (left, right) => String(placeOf(left).name).localeCompare(String(placeOf(right).name), 'vi');
  return list.map(item => ({ item, meters: placeDistance(origin, placeOf(item)) })).sort((left, right) => {
    if (left.meters !== right.meters) {
      if (left.meters === null) return 1;
      if (right.meters === null) return -1;
      return left.meters - right.meters;
    }
    return (tie ? tie(left.item, right.item) : 0) || byName(left.item, right.item);
  }).map(entry => entry.item);
}
/** Danh sách khu dùng chung: gần trước khi có vị trí, không thì theo tên, mỗi khu kèm số chỗ đang mở. */
export function areaRows(areas, places, origin) {
  const counts = new Map();
  for (const place of places) if (place.areaId && place.status !== 'closed') counts.set(place.areaId, (counts.get(place.areaId) || 0) + 1);
  return areas.map(area => ({ area, count: counts.get(area.id) || 0, meters: origin ? distanceMeters(origin, area) : null }))
    .sort((left, right) => (left.meters !== null && right.meters !== null && left.meters !== right.meters ? left.meters - right.meters : 0) || left.area.name.localeCompare(right.area.name, 'vi'));
}
