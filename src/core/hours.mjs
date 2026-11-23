/** @param {Date|string|number} now */
export function vietnamTime(now) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Invalid time');
  return new Date(instant.getTime() + 7 * 3600000);
}
/** @param {Array<{days:number[],open:string,close:string}>|null} hours @param {Date|string|number} now */
export function isOpen(hours, now) {
  if (!hours?.length) return true;
  const time = vietnamTime(now);
  const day = time.getUTCDay() || 7;
  const minute = time.getUTCHours() * 60 + time.getUTCMinutes();
  const parse = value => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
  return hours.some(period => {
    const start = parse(period.open), end = parse(period.close);
    if (!Number.isFinite(start + end)) return false;
    if (start === end) return period.days.includes(day);
    if (start < end) return period.days.includes(day) && minute >= start && minute < end;
    return (period.days.includes(day) && minute >= start) || (period.days.includes(day === 1 ? 7 : day - 1) && minute < end);
  });
}
/** @param {Date|string|number} now */
export function defaultGroup(now) {
  const hour = vietnamTime(now).getUTCHours();
  return hour >= 21 ? 'nhau' : hour >= 14 && hour < 17 ? 'ca-phe' : 'an';
}
