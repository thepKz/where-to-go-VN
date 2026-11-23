import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const target = new URL('../public/data/', import.meta.url);
await mkdir(target, { recursive: true });
let source;
for (const path of ['../../data/places.json', '../../measure/fixtures/places.fixture.json']) {
  try { await access(new URL(path, import.meta.url)); source = new URL(path, import.meta.url); break; } catch {}
}
// Không có nguồn mà tệp đóng gói đã có bản thật (ví dụ đã đưa vào kho): giữ nguyên, không ghi đè bằng dữ liệu mẫu.
let kept = false;
if (!source) { try { const current = JSON.parse(await readFile(new URL('places.json', target), 'utf8')); kept = !current.sample && Array.isArray(current.places) && current.places.length > 0; } catch {} }
if (kept) console.log('Giữ tệp dữ liệu chỗ đã có');
else if (source) await copyFile(source, new URL('places.json', target));
else await writeFile(new URL('places.json', target), JSON.stringify({
  version: '2026-11-14', sample: true,
  areas: [{ id: 'khu-mau', name: 'Khu mẫu', kind: 'area', district: '', lat: 21.03, lng: 105.83 }],
  dishes: [{ id: 'mon-mau', name: 'Món mẫu', blurb: 'Dữ liệu mẫu để thử ứng dụng' }],
  places: ['bún', 'phở', 'cơm', 'cháo', 'bánh', 'lẩu'].map((kind, index) => ({
    id: `cho-mau-${index}`, name: `Chỗ mẫu ${index + 1}`, group: 'an', kind,
    address: 'Địa chỉ mẫu', district: '', areaId: 'khu-mau', lat: 21.03 + index / 10000, lng: 105.83,
    geo: 'area', dishes: ['mon-mau'], dishNotes: [], price: null, hours: [], hoursText: null,
    why: 'Dữ liệu mẫu, không phải gợi ý thật', sources: [{ url: 'https://example.org', site: 'Dữ liệu mẫu', kind: 'khac', says: '', checked: '2026-11-14', verified: 'none' }],
    mapsUrl: 'https://www.google.com/maps', trust: 0.2, badges: [], status: 'open', updated: '2026-11-14'
  }))
}, null, 2));
if (!kept) console.log(source ? 'Đã chép dữ liệu chỗ' : 'Đang dùng dữ liệu mẫu');
