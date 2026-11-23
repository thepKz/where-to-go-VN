import { distanceMeters } from './geo.mjs';
import { isOpen } from './hours.mjs';
import { seededRandom } from './rounds.mjs';
import { foldText } from './text.mjs';
/**
 * Vì sao một chỗ là chỗ chính của món (so nguyên từ, bỏ dấu, không phân biệt hoa thường): 'a' tên món nằm trong tên chỗ,
 * 'b' trong loại của chỗ, 'c' trong mục đầu tiên của dishNotes. Không phải chỗ chính thì null.
 */
export function mainReason(dish, place) {
  const name = foldText(dish?.name);
  if (!name) return null;
  const pattern = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[]\]/g, '\$&').replace(/s+/g, '\s+')}($|[^a-z0-9])`);
  if (pattern.test(foldText(place?.name))) return 'a';
  if (pattern.test(foldText(place?.kind))) return 'b';
  const first = place?.dishNotes?.[0];
  if (typeof first === 'string' && pattern.test(foldText(first))) return 'c';
  return null;
}
export function isMainPlaceOf(dish, place) { return mainReason(dish, place) !== null; }
/** @param {import('../store/types').Place[]} places @param {any} options */
export function eligiblePlaces(places, options) {
  const { group, where, now, marks = [], picks = [], exclude = [] } = options;
  return places.filter(place => {
    if (group && place.group !== group || place.status === 'closed' || exclude.includes(place.id)) return false;
    const own = marks.filter(mark => mark.place_id === place.id);
    if (own.some(mark => mark.verdict === 'never')) return false;
    if (!own.some(mark => mark.verdict === 'great') && picks.some(pick => pick.place_id === place.id && new Date(now).getTime() >= new Date(pick.picked_at).getTime() && new Date(now).getTime() - new Date(pick.picked_at).getTime() < 14 * 86400000)) return false;
    if (now && !isOpen(place.hours, now)) return false;
    if (typeof where === 'string') return place.areaId === where;
    return !where || distanceMeters(where, place) !== null;
  });
}
/** @param {import('../store/types').Place[]} places @param {any} options */
export function suggest({ places, origin, areaId, ...input }) {
  const options = { ...input, where: areaId || origin || input.where || null };
  let candidates = eligiblePlaces(places, options);
  const near = options.where && typeof options.where !== 'string';
  let radius = 3000;
  if (near) {
    while (radius < 8000 && candidates.filter(place => distanceMeters(options.where, place) <= radius).length < 3) radius = radius === 3000 ? 5000 : 8000;
    candidates = candidates.filter(place => distanceMeters(options.where, place) <= radius);
  }
  const random = seededRandom(options.seed ?? 0);
  const ranked = candidates.sort((left, right) => left.id.localeCompare(right.id)).map(place => {
    const own = (options.marks ?? []).filter(mark => mark.place_id === place.id);
    const wants = new Set(own.filter(mark => mark.want).map(mark => mark.member_id)).size;
    const meters = near ? distanceMeters(options.where, place) : null;
    const score = Math.max(0, Math.min(1, place.trust ?? 0)) * .4 + (meters === null ? 0 : Math.max(0, 1 - meters / radius) * .25) + Math.min(wants, 2) * .1 + (!own.some(mark => mark.visited_at) ? .1 : 0) + (own.some(mark => mark.verdict === 'great') ? .05 : 0) + random() * .02;
    return { place, score };
  }).sort((left, right) => right.score - left.score || left.place.id.localeCompare(right.place.id));
  const selected = [];
  // Ba chỗ khác loại nhỏ nếu được, và không hai chỗ cách nhau dưới 150 m khi còn chỗ khác đủ điều kiện. Chỗ không có toạ độ không bị coi là sát nhau.
  const close = (left, right) => { const meters = distanceMeters(left, right); return meters !== null && meters < 150; };
  const apart = place => !selected.some(other => close(other, place));
  for (const entry of ranked) if (!selected.some(place => place.kind === entry.place.kind) && apart(entry.place) && selected.length < 3) selected.push(entry.place);
  for (const entry of ranked) if (!selected.includes(entry.place) && apart(entry.place) && selected.length < 3) selected.push(entry.place);
  for (const entry of ranked) if (!selected.includes(entry.place) && selected.length < 3) selected.push(entry.place);
  selected.sort((left, right) => ranked.find(entry => entry.place.id === left.id).score < ranked.find(entry => entry.place.id === right.id).score ? 1 : -1);
  return { places: selected, radiusKm: near ? radius / 1000 : null };
}
/** @param {any[]} dishes @param {import('../store/types').Place[]} places @param {any} options */
export function pickDish({ dishes, places, origin, areaId, ...input }) {
  const options = { ...input, where: areaId || origin || input.where || null };
  const history = options.history ?? [];
  if (history.length >= 3) return { dish: null, places: [], rerollsLeft: 0, history };
  const eligible = eligiblePlaces(places, { ...options, exclude: [], group: 'an' }).filter(place => !options.where || typeof options.where === 'string' || distanceMeters(options.where, place) <= 8000);
  const fresh = dishes.filter(dish => !history.includes(dish.id) && !(options.exclude ?? []).includes(dish.id));
  // Món chỉ được quay khi trong phạm vi có chỗ chính của món. Không món nào có thì quay như cũ (cho phép chỗ phụ) để màn không rỗng.
  const hasDish = (dish, place) => place.dishes.includes(dish.id) || ['a', 'b'].includes(mainReason(dish, place));
  // Nơi là vị trí: nới bán kính 3, 5, 8 km tới khi có từ 5 món có chỗ chính trong bán kính đó. Nơi là khu thì không có bán kính.
  const point = options.where && typeof options.where !== 'string';
  let radius = 8000;
  if (point) for (const step of [3000, 5000, 8000]) { radius = step; if (fresh.filter(dish => eligible.some(place => distanceMeters(options.where, place) <= step && isMainPlaceOf(dish, place))).length >= 5) break; }
  const reach = place => !point || distanceMeters(options.where, place) <= radius;
  const mainOnly = fresh.filter(dish => eligible.some(place => reach(place) && isMainPlaceOf(dish, place)));
  const available = (mainOnly.length ? mainOnly : fresh.filter(dish => eligible.some(place => hasDish(dish, place)))).sort((left, right) => left.id.localeCompare(right.id));
  const dish = available[Math.floor(seededRandom(`${options.seed ?? 0}:${history.length}`)() * available.length)] ?? null;
  if (!dish) return { dish: null, places: [] };
  const serving = eligible.filter(place => hasDish(dish, place));
  const main = eligible.filter(place => reach(place) && isMainPlaceOf(dish, place));
  const chosen = suggest({ ...options, places: main.length ? main : serving, exclude: [], group: 'an' }).places;
  if (point) chosen.sort((left, right) => distanceMeters(options.where, left) - distanceMeters(options.where, right));
  return { dish, places: chosen, rerollsLeft: Math.max(0, 2 - history.length), history: [...history, dish.id] };
}
