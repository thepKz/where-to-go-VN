import { isOpen, vietnamTime } from './hours.mjs';
/** Một cách ghi chung cho mọi nơi: dưới 1 km làm tròn tới 10 m ("410 m"), từ 1 km ghi một số lẻ với dấu phẩy ("4,9 km"). Không có chữ "khoảng". Chỗ không có toạ độ (none) thì không có khoảng cách. */
export function formatDistance(meters, accuracy = 'exact') {
  if (meters == null || !Number.isFinite(meters) || meters < 0 || accuracy === 'none') return '';
  if (meters < 995) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(Math.round(meters / 100) / 10).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
export function aroundAreaName(name) {
  const value = String(name ?? '').trim();
  return /^quanh(?:\s|$)/i.test(foldText(value)) ? value : `Quanh ${value}`;
}
export function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
}
export function formatTime(value) {
  return /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : '';
}
export function formatHours(hours) { return (hours ?? []).map(period => `${formatTime(period.open)} đến ${formatTime(period.close)}`).join(', '); }
const weekdayText = ['', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'chủ nhật'];
export function formatTextHoursStatus(hoursText, now) {
  const text = foldText(hoursText);
  if (!text) return '';
  if (text.includes('hang ngay') || text.includes('moi ngay')) return '';
  let time;
  try { time = vietnamTime(now); } catch { return ''; }
  const today = time.getUTCDay() || 7;
  const hasDay = weekdayText.slice(1).some(day => text.includes(foldText(day)));
  return hasDay && !text.includes(foldText(weekdayText[today])) ? `Chưa có giờ ${weekdayText[today]}` : '';
}
/** Chữ cái đầu viết hoa cho loại chỗ và tên món lúc hiển thị. Không đụng phần còn lại, không sửa dữ liệu. */
export function capitalizeFirst(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  const first = text.charAt(0);
  return first.toLocaleUpperCase('vi') + text.slice(1);
}
/** Bỏ dấu và hạ chữ để so khớp lúc tìm. */
export function foldText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').trim();
}
export function sameDishKind(left, right) {
  const normalize = value => foldText(value).replace(/^mon\s+/, '').trim();
  return !!normalize(left) && normalize(left) === normalize(right);
}
export function areaNamesLine(names, count, fits = true) {
  const values = names.filter(Boolean);
  if (fits && values.length) return values.join(', ');
  if (!values.length) return `${count} chỗ khác`;
  return count > 1 ? `${values[0]} và ${count - 1} chỗ khác` : values[0];
}
export function formatAreaCount(count, unit = 'chỗ') { return `${Number(count).toLocaleString('vi-VN')} ${unit}`; }
export function formatAreaInsideCount(count, unit = 'chỗ') { return `${formatAreaCount(count, unit)} bên trong`; }
/** Đường mở khi bấm Chỉ đường: chỉ chỗ có toạ độ đúng số nhà mới dẫn tới toạ độ, còn lại mở trang tìm theo tên và địa chỉ. */
export function directionsUrl(place) {
  if (place.geo === 'exact' && Number.isFinite(place.lat) && Number.isFinite(place.lng)) return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return place.mapsUrl;
}
const weekdayNames = ['', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'chủ nhật'];
function clock(minute) {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
/**
 * Cụm ngắn về tình trạng mở cửa tính theo giờ Việt Nam, ví dụ "Đang mở tới 22:00" hay "Đang đóng, mở lúc 07:00".
 * Không có giờ (hoặc giờ không đọc được) thì trả về chuỗi rỗng, không đoán.
 * Qua nửa đêm tính theo ngày bắt đầu, nghỉ trưa là hai khoảng trong một ngày, các khoảng liền nhau được nối lại.
 */
export function formatOpenStatus(hours, now) {
  if (!Array.isArray(hours) || !hours.length) return '';
  let time;
  try { time = vietnamTime(now); } catch { return ''; }
  const today = time.getUTCDay() || 7;
  const minute = time.getUTCHours() * 60 + time.getUTCMinutes();
  const parse = value => formatTime(value) ? Number(value.split(':')[0]) * 60 + Number(value.slice(-2)) : NaN;
  const valid = hours.filter(period => Array.isArray(period?.days) && period.days.length > 0 && Number.isFinite(parse(period.open) + parse(period.close)));
  if (!valid.length) return '';
  const previous = today === 1 ? 7 : today - 1;
  const hasToday = valid.some(period => period.days.includes(today));
  const hasOvernightFromPrevious = valid.some(period => {
    const start = parse(period.open), end = parse(period.close);
    return start > end && period.days.includes(previous) && minute < end;
  });
  if (!hasToday && !hasOvernightFromPrevious) return `Chưa có giờ ${weekdayNames[today]}`;
  const spans = [];
  for (let offset = -1; offset <= 7; offset++) {
    const day = (((today - 1 + offset) % 7) + 7) % 7 + 1;
    for (const period of hours) {
      if (!Array.isArray(period?.days) || !period.days.includes(day)) continue;
      const start = parse(period.open), end = parse(period.close);
      if (!Number.isFinite(start + end)) continue;
      const base = offset * 1440;
      if (start === end) spans.push([base, base + 1440]);
      else if (start < end) spans.push([base + start, base + end]);
      else spans.push([base + start, base + 1440 + end]);
    }
  }
  if (!spans.length) return '';
  spans.sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  if (isOpen(hours, now)) {
    const current = merged.find(span => minute >= span[0] && minute < span[1]) ?? merged.find(span => minute >= span[0] && minute <= span[1]);
    if (!current || current[1] - minute >= 6 * 1440) return 'Đang mở cả ngày';
    return `Đang mở tới ${clock(current[1])}`;
  }
  const next = merged.find(span => span[0] > minute);
  if (!next) return '';
  const days = Math.floor(next[0] / 1440);
  const day = days === 0 ? '' : days === 1 ? ' ngày mai' : ` ${weekdayNames[(((today - 1 + days) % 7) + 7) % 7 + 1]}`;
  return `Đang đóng, mở lúc ${clock(next[0])}${day}`;
}
/** Tên trang của một nguồn: dùng trường site, bỏ tiền tố www. và đường dẫn. Chỉ có tên miền thì hiện tên miền. */
export function siteName(source) {
  const text = String(source?.site ?? '').trim();
  let host = '';
  if (!text) { try { host = new URL(source.url).hostname; } catch { host = ''; } }
  const raw = (text || host).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const domainWithPath = /^[^\s/?#]+\.[a-z]{2,}(?:[/?#]|$)/i.test(raw);
  const named = domainWithPath ? raw.split(/[/?#]/)[0] : raw;
  return named.replace(/^www\./i, '').trim();
}
const groupKinds = { an: 'Ăn', 'ca-phe': 'Cà phê', nhau: 'Nhậu', choi: 'Chơi' };
/** Loại chỗ để hiện. Dữ liệu không ghi loại thì dùng tên nhóm, để dòng loại luôn có. */
export function placeKind(place) {
  return capitalizeFirst(place?.kind) || groupKinds[place?.group] || '';
}
/** Dòng loại của chỗ: loại nếu có, không thì (chỉ nhóm ăn) hai món đầu nếu có, không thì bỏ trống. Không dùng tên nhóm thay cho loại. `dishes` chỉ có khi dùng món thay loại. */
export function kindLine(place, { dishes = true } = {}) {
  if (capitalizeFirst(place?.kind)) return { kind: capitalizeFirst(place.kind), dishes: null };
  // Món thay cho loại chỉ dành cho nhóm ăn. Nhóm khác mà loại trống thì bỏ trống dòng này.
  const names = dishes && place?.group === 'an' ? dishList(place, 2) : [];
  if (names.length) return { kind: '', dishes: names.join(', ') };
  return { kind: '', dishes: null };
}
/** Món nên gọi để hiện thay cho câu vì sao: bỏ trùng, bỏ trống, bỏ món trùng với loại hoặc tên nhóm của chỗ, tối đa số món cho trước. */
export function dishList(place, limit = 2) {
  const seen = new Set();
  const names = [];
  const spaced = value => ` ${foldText(value).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const kind = spaced(place?.kind), group = spaced(groupKinds[place?.group]);
  for (const raw of place?.dishNotes ?? []) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    const key = name.toLocaleLowerCase('vi');
    if (!name || seen.has(key)) continue;
    const word = spaced(name);
    if (word.trim() && (word === group || (kind.trim() && kind.includes(word)))) continue;
    seen.add(key);
    names.push(capitalizeFirst(name));
  }
  return names.slice(0, limit);
}
/** Ngày kiểm mới nhất của cả khối nguồn, hoặc ngày dữ liệu nếu không nguồn nào ghi ngày. */
export function latestChecked(sources, fallback) {
  const days = [...(sources ?? []).map(source => source?.checked), fallback].filter(value => value && Number.isFinite(new Date(value).getTime()));
  return days.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}
const verifyRank = { 'name-street': 0, name: 1, title: 2 };
/** Nguồn đã kiểm xếp trước, nguồn chưa kiểm xếp sau, giữ thứ tự cũ trong cùng nhóm. */
export function orderSources(sources) {
  return (sources ?? []).map((source, index) => ({ source, index })).sort((left, right) => (verifyRank[left.source.verified] ?? 3) - (verifyRank[right.source.verified] ?? 3) || left.index - right.index).map(entry => entry.source);
}
/** Nguồn đã kiểm được tên chỗ (tên và phố, hoặc chỉ tên). */
export function isChecked(source) { return source?.verified === 'name' || source?.verified === 'name-street'; }
/** Mọi món của chỗ để hiện ở chi tiết: bỏ trống và bỏ trùng, giữ cả món trùng với dòng loại. */
export function allDishes(place) {
  const seen = new Set();
  const names = [];
  for (const raw of place?.dishNotes ?? []) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    const key = name.toLocaleLowerCase('vi');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(capitalizeFirst(name));
  }
  return names;
}

/** Chi tiết giữ đủ món, kể cả món trùng dòng loại. */
export function detailDishes(place) {
  return allDishes(place);
}

/** Địa chỉ chi tiết bỏ phần nơi chứa và ghép tầng một lần. */
export function detailLocation(place, area) {
  const raw = String(place?.address ?? '').trim();
  const areaName = foldText(area?.name);
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean).filter(part => !areaName || foldText(part) !== areaName);
  let address = parts.join(', ');
  const floor = String(place?.floor ?? '').trim();
  if (floor && !foldText(address).includes(foldText(floor))) address = [address, `Tầng ${floor}`].filter(Boolean).join(', ');
  return address || raw || (floor ? `Tầng ${floor}` : '');
}

/** Nhãn tầng thống nhất cho danh sách và chi tiết. */
export function floorLabel(value) {
  const text = String(value ?? '').trim().replace(/^tầng(?:\s+hầm)?\s*/i, '');
  return text ? `Tầng ${text}` : '';
}

/** Tên chỗ trong trang nơi chứa, bỏ đuôi lặp tên nơi chứa. */
export function placeNameInArea(place, area) {
  const name = String(place?.name ?? '').trim();
  const areaName = String(area?.name ?? '').trim();
  if (!name || !areaName) return name;
  const index = foldText(name).lastIndexOf(foldText(areaName));
  if (index < 1 || index + areaName.length !== name.length) return name;
  const before = name.slice(0, index).trim();
  const separators = [...before.matchAll(/\s[-–—]\s?|(\s*,\s*)/g)].map(match => match.index ?? -1).filter(index => index >= 0);
  const separator = separators.at(-1) ?? -1;
  return (separator >= 0 ? before.slice(0, separator) : before).trim() || name;
}

const cuisineRules = [
  ['lau-nuong', ['lẩu', 'nướng', 'bbq', 'barbecue']], ['thai', ['thái', 'thai']], ['han', ['hàn', 'korean', 'kimbap', 'tokbokki']],
  ['nhat', ['nhật', 'sushi', 'udon', 'ramen']], ['trung', ['trung hoa', 'trung quốc', 'mì trung']], ['y', ['ý', 'italian', 'pizza', 'pasta']],
  ['au', ['âu', 'steak', 'pháp', 'french']], ['viet', ['việt', 'phở', 'bún', 'cơm', 'xôi', 'bánh mì', 'nem', 'chả cá']],
  ['chay', ['chay', 'vegetarian']], ['hai-san', ['hải sản', 'seafood']], ['an-vat', ['ăn vặt', 'đồ ăn vặt', 'snack']],
];
const nameDishRules = [
  ['lau-nuong', ['lẩu', 'nướng', 'bbq', 'barbecue']], ['thai', ['pad thai', 'tom yum']],
  ['han', ['kimbap', 'tokbokki']], ['nhat', ['sushi', 'udon', 'ramen']], ['trung', ['dimsum']],
  ['y', ['pizza', 'pasta', 'mì ý', 'mỳ ý']], ['au', ['bít tết', 'steak']],
  ['viet', ['bún chả', 'phở', 'bún', 'cơm', 'xôi', 'bánh mì', 'nem', 'chả cá']],
];
const nameContextRules = [
  ['thai', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:thai)\b/],
  ['han', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:han|korean)\b/],
  ['nhat', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:nhat)\b/],
  ['trung', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:trung)\b/],
  ['au', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:au|phap)\b/],
  ['y', /(?:mon|am thuc|nha hang|quan an|buffet|do an|bep)\s+(?:y|italian)\b/],
  ['thai', /\bthai\s+(?:kitchen|restaurant|house|food|cuisine)\b/],
];
const hasTerm = (text, term) => ` ${foldText(text).replace(/[^a-z0-9]+/g, ' ').trim()} `.includes(` ${foldText(term)} `);
/** Mã loại món tất định, dùng trường mới trước rồi mới suy từ dữ liệu cũ. */
export function cuisineOf(place, cuisines = []) {
  if (Array.isArray(place?.cuisine)) return [...new Set(place.cuisine.filter(value => typeof value === 'string' && value))];
  const text = foldText([place?.kind, ...(place?.dishes ?? []), ...(place?.dishNotes ?? [])].filter(Boolean).join(' '));
  const result = [];
  for (const [id, words] of cuisineRules) if (words.some(word => hasTerm(text, word))) result.push(id);
  if (Array.isArray(cuisines)) for (const item of cuisines) if (item?.id && item?.name && hasTerm(text, item.name) && !result.includes(item.id)) result.push(item.id);
  const name = foldText(String(place?.name ?? '').split(/\s+[-–—]\s+/)[0]);
  for (const [id, words] of nameDishRules) if (words.some(word => hasTerm(name, word)) && !result.includes(id)) result.push(id);
  for (const [id, pattern] of nameContextRules) if (pattern.test(name) && !result.includes(id)) result.push(id);
  return [...new Set(result)];
}
/** Món Âu gồm cả mã Âu, Ý và Pháp. */
export function cuisineMatches(place, selected, cuisines = []) {
  if (!selected) return true;
  const ids = cuisineOf(place, cuisines);
  return selected === 'au' ? ids.some(id => id === 'au' || id === 'y' || id === 'phap') : ids.includes(selected);
}
const priceUnitText = { nguoi: 'mỗi người', mon: 'mỗi món', ve: 'mỗi vé', gio: 'mỗi giờ' };
const shortMoney = value => Number.isFinite(value) ? Math.round(value / 1000) : null;
/** Giá ước tính ngắn, ưu tiên số mới rồi rút gọn chữ giá cũ. */
export function priceLabel(place) {
  const min = Number.isFinite(place?.priceMin) ? shortMoney(place.priceMin) : null;
  const max = Number.isFinite(place?.priceMax) ? shortMoney(place.priceMax) : null;
  const unit = priceUnitText[place?.priceUnit] || '';
  if (min !== null || max !== null) {
    const text = min !== null && max !== null && min !== max ? `${min} đến ${max} nghìn` : `${min ?? max} nghìn`;
    return unit ? `${text} ${unit}` : text;
  }
  const raw = String(place?.price ?? '').trim();
  if (!raw) return null;
  const values = [...raw.matchAll(/\d[\d.,]*/g)].map(match => Number(match[0].replace(/[.,]/g, ''))).filter(Number.isFinite).map(shortMoney);
  if (!values.length) return raw;
  const text = values.length > 1 && values[0] !== values[1] ? `${values[0]} đến ${values[1]} nghìn` : `${values[0]} nghìn`;
  return unit ? `${text} ${unit}` : text;
}
