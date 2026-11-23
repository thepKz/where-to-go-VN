import { distanceMeters } from './geo.mjs';
// Chỗ đứng đặt bằng tay: khi máy không lấy được vị trí thì người dùng chọn một khu hoặc chạm một điểm trên bản đồ.
// Chỉ lưu trên máy đó. Vị trí thật lấy được thì thắng.
const kinds = ['khu', 'cham'];
const inRange = point => Boolean(point) && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
const round = value => Number(value.toFixed(5));
/** Lấy tâm một khu làm chỗ đứng. */
export function standingFromArea(area) {
  if (!area || typeof area.id !== 'string' || !inRange(area)) return null;
  return { lat: round(area.lat), lng: round(area.lng), kind: 'khu', areaId: area.id };
}
/** Một điểm chạm trên bản đồ làm chỗ đứng. */
export function standingFromTap(point) {
  if (!inRange(point)) return null;
  return { lat: round(point.lat), lng: round(point.lng), kind: 'cham' };
}
/** Đọc chuỗi đã lưu. Hỏng hoặc sai dạng thì không có chỗ đứng, không ném lỗi. */
export function readStanding(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!inRange(value) || !kinds.includes(value.kind)) return null;
    return value.kind === 'khu' && typeof value.areaId === 'string' ? { lat: round(value.lat), lng: round(value.lng), kind: 'khu', areaId: value.areaId } : value.kind === 'cham' ? { lat: round(value.lat), lng: round(value.lng), kind: 'cham' } : null;
  } catch { return null; }
}
export function writeStanding(standing) { return standing ? JSON.stringify(standing) : ''; }
/** Điểm xuất phát dùng cho khoảng cách, Gần đây, bản đồ, Quay món: vị trí thật thắng, không có thì chỗ đứng đặt tay. */
export function pickOrigin(real, standing) {
  if (inRange(real)) return { lat: real.lat, lng: real.lng };
  return inRange(standing) ? { lat: standing.lat, lng: standing.lng } : null;
}
/** Trang có được hỏi vị trí không. Địa chỉ không an toàn (ví dụ mạng nhà) thì trình duyệt không cho, nên không gọi. */
export function canAskLocation({ secure, hasApi }) { return Boolean(secure && hasApi); }
/** Nơi cần nhớ khi đặt chỗ đứng: chỉ nhớ khu đang chọn. Nơi đang là một điểm (cũng là chỗ đứng cũ) thì giữ điều đã nhớ. */
export function rememberBefore(where, remembered) { return typeof where === 'string' ? where : remembered ?? null; }
/**
 * Bỏ chỗ đứng đặt tay. Đã nhớ một khu từ trước thì trở về khu đó. Không thì không còn nơi nào và không có vị trí thật,
 * nên màn về trạng thái "không lấy được vị trí": gần đây không được chọn (failed là true).
 */
export function afterClear({ where, before }) {
  if (typeof where === 'string') return { where, failed: false };
  if (before) return { where: before, failed: false };
  return { where: null, failed: true };
}

// Hỏi chỗ đứng khi không có vị trí, và nói quanh chỗ đứng có gì.
/** Tâm dùng chung để xếp khu và mở bản đồ khi chưa biết người dùng đứng đâu. */
export const CITY_CENTERS = Object.freeze({
  'ha-noi': Object.freeze({ lat: 21.0287, lng: 105.8524 }),
  'ho-chi-minh': Object.freeze({ lat: 10.7725, lng: 106.698 }),
});
/** Hồ Gươm, gốc để xếp khu khi chưa biết người dùng đứng đâu. */
export const HO_GUOM = CITY_CENTERS['ha-noi'];
/** Điểm xem tạm khi chưa có vị trí thật hay chỗ đứng đặt tay. */
export function viewOrigin(real, where) {
  if (inRange(real)) return { lat: real.lat, lng: real.lng };
  if (where && typeof where === 'object' && inRange(where)) return { lat: where.lat, lng: where.lng };
  return HO_GUOM;
}
/** Nhớ một khu vừa dùng làm chỗ đứng: khu mới nhất đứng đầu, không trùng, giữ tối đa `max` khu. */
export function rememberArea(list, id, max = 8) {
  const kept = Array.isArray(list) ? list.filter(item => typeof item === 'string' && item !== id) : [];
  return typeof id === 'string' && id ? [id, ...kept].slice(0, max) : kept;
}
/** Đọc danh sách khu đã dùng từ chuỗi đã lưu. Hỏng thì trả về danh sách rỗng. */
export function readUsedAreas(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 8) : [];
  } catch { return []; }
}
/** Thứ tự khu khi hỏi chỗ đứng: khu đã dùng trên máy này trước (mới nhất đầu), rồi theo khoảng cách từ Hồ Gươm tăng dần, bằng nhau thì theo tên. */
export function standingAreaOrder(areas, used = [], from = HO_GUOM) {
  const rank = new Map(used.map((id, index) => [id, index]));
  const far = area => distanceMeters(from, area) ?? Infinity;
  return [...areas].sort((left, right) => {
    const a = rank.has(left.id), b = rank.has(right.id);
    if (a !== b) return a ? -1 : 1;
    if (a && b) return rank.get(left.id) - rank.get(right.id);
    return far(left) - far(right) || String(left.name).localeCompare(String(right.name), 'vi');
  });
}
const onMap = place => Boolean(place) && place.geo !== 'none' && place.status !== 'closed' && Number.isFinite(place.lat) && Number.isFinite(place.lng);
/**
 * Quanh một điểm: số chỗ trong `radius` mét (mặc định 1 km), tối đa ba chỗ gần nhất nằm trong `reach` mét (mặc định 3 km),
 * và khu gần nhất có chỗ (để nói khi quanh đó chưa có chỗ nào).
 */
export function nearSummary({ origin, places, areas, radius = 1000, reach = 3000 }) {
  const rows = (places ?? []).filter(onMap).map(place => ({ place, meters: distanceMeters(origin, place) })).filter(row => row.meters !== null).sort((left, right) => left.meters - right.meters);
  const withArea = new Set(rows.map(row => row.place.areaId).filter(Boolean));
  const area = (areas ?? []).filter(item => withArea.has(item.id)).map(item => ({ area: item, meters: distanceMeters(origin, item) })).filter(row => row.meters !== null).sort((left, right) => left.meters - right.meters)[0] ?? null;
  return {
    count: rows.filter(row => row.meters <= radius).length,
    nearest: rows.filter(row => row.meters <= reach).slice(0, 3).map(row => row.place),
    area: area ? area.area : null,
    areaMeters: area ? area.meters : null,
  };
}
/** Các điểm để bản đồ phóng vừa: chỗ đứng, ba chỗ gần nhất trong 3 km, không có chỗ nào thì thêm tâm khu gần nhất. */
export function framePoints(origin, summary) {
  if (!origin) return [];
  const points = [{ lat: origin.lat, lng: origin.lng }];
  for (const place of summary.nearest) points.push({ lat: place.lat, lng: place.lng });
  if (!summary.nearest.length && summary.area) points.push({ lat: summary.area.lat, lng: summary.area.lng });
  return points;
}
