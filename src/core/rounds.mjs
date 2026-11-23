/** @param {string|number} value */
export function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
/** @param {string|number} seed */
export function seededRandom(seed) {
  let state = hashSeed(seed);
  return () => { state += 0x6D2B79F5; let next = Math.imul(state ^ state >>> 15, state | 1); next ^= next + Math.imul(next ^ next >>> 7, next | 61); return ((next ^ next >>> 14) >>> 0) / 4294967296; };
}
/** @param {string|{lat:number,lng:number}|null} where */
export function normalizeWhere(where) {
  if (typeof where === 'string') return where;
  if (!where || ![where.lat, where.lng].every(Number.isFinite)) return null;
  return { lat: Number(where.lat.toFixed(3)), lng: Number(where.lng.toFixed(3)) };
}
/** @param {{householdId:string,group:string,where:any,now:Date|string|number,seed?:number|string,iteration?:number}} options */
export function roundSeed(options) {
  return hashSeed(JSON.stringify([options.householdId, options.group, normalizeWhere(options.where), Math.floor(new Date(options.now).getTime() / 1800000), options.seed ?? '', options.iteration ?? 0]));
}
export function findRound(rounds, { householdId, group, where, now }) {
  const location = JSON.stringify(normalizeWhere(where));
  return rounds.filter(round => round.household_id === householdId && round.group === group && JSON.stringify(round.where) === location && new Date(now).getTime() - new Date(round.created_at).getTime() >= 0 && new Date(now).getTime() - new Date(round.created_at).getTime() < 1800000).sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
}
