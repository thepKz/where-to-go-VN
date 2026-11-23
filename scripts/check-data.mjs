// Bước chặn của lệnh dựng: không âm thầm đưa dữ liệu mẫu lên mạng.
// Đặt ALLOW_SAMPLE_DATA=1 nếu cố ý dựng bản thử với dữ liệu mẫu.
import { readFile } from 'node:fs/promises';
const MIN_PLACES = 100;
let data;
try { data = JSON.parse(await readFile(new URL('../public/data/places.json', import.meta.url), 'utf8')); }
catch { data = null; }
const count = Array.isArray(data?.places) ? data.places.length : 0;
if (process.env.ALLOW_SAMPLE_DATA === '1') { console.log(`Cho phép dữ liệu mẫu (${count} chỗ)`); process.exit(0); }
if (!data || data.sample === true || count < MIN_PLACES) {
  console.error(`DỪNG DỰNG: tệp public/data/places.json chỉ có ${count} chỗ${data?.sample ? ' và là dữ liệu mẫu' : ''}, cần ít nhất ${MIN_PLACES} chỗ thật.`);
  console.error('Chép apps/di-dau/data/places.json vào apps/di-dau/app/public/data/places.json rồi dựng lại. Chỉ để thử thì đặt ALLOW_SAMPLE_DATA=1.');
  process.exit(1);
}
console.log(`Dữ liệu chỗ hợp lệ: ${count} chỗ`);
