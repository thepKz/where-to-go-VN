// npm run pages: dựng bản xem thử cho GitHub Pages, chạy dưới đường dẫn /where-to-go-VN/.
// Bản này không có máy chủ đồng bộ: dùng thử một mình trên trình duyệt, dữ liệu chỗ đóng gói sẵn.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const base = process.env.PAGES_BASE || '/where-to-go-VN/';
const env = { ...process.env, VITE_DATA_URL: base + 'data/places.json', VITE_STORE: '', VITE_SYNC_URL: '' };
const built = spawnSync(`npm run build -- --base=${base}`, { shell: true, stdio: 'inherit', env });
if (built.status !== 0) process.exit(built.status ?? 1);
// Tệp kê ứng dụng dùng đường dẫn tuyệt đối từ gốc: đổi sang đường dẫn con của Pages.
const manifest = new URL('../dist/manifest.webmanifest', import.meta.url);
writeFileSync(manifest, readFileSync(manifest, 'utf8').replaceAll('"/', '"' + base), 'utf8');
// Service worker của bản nhà đệm theo gốc "/", không hợp với đường dẫn con: bỏ khỏi bản Pages.
rmSync(new URL('../dist/service-worker.js', import.meta.url), { force: true });
writeFileSync(new URL('../dist/.nojekyll', import.meta.url), '', 'utf8');
console.log('Bản Pages nằm ở dist, đường dẫn gốc ' + base);
