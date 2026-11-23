// npm run nha: dựng trang cho chế độ nhà rồi phục vụ trang và đồng bộ trên một cổng.
// Dùng: npm run nha -- --port 4650   (thêm --khong-dung để bỏ bước dựng khi đã dựng rồi, --data <thư mục> để đổi nơi ghi dữ liệu)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHome } from '../home-server.mjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const argument = process.argv.indexOf('--port');
const port = Number(argument < 0 ? 4650 : process.argv[argument + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [4310, 4311].includes(port)) { console.error('Cổng không dùng được, chọn một số từ 1024 đến 65535'); process.exit(1); }
const dist = fileURLToPath(new URL('../dist-nha/', import.meta.url));
if (!process.argv.includes('--khong-dung') || !existsSync(dist)) {
  console.log('Đang dựng trang cho cả nhà, chờ một lúc');
  const built = spawnSync('npm run build -- --outDir dist-nha', { cwd: app, shell: true, stdio: 'inherit', env: { ...process.env, VITE_STORE: '', VITE_SYNC_URL: 'cung-goc' } });
  if (built.status !== 0) { console.error('Dựng chưa xong, xem lỗi ở trên'); process.exit(1); }
}
// Nơi ghi dữ liệu: --data <thư mục>, hoặc biến DIDAU_LOCAL_DIR, mặc định apps/di-dau/local.
const dataArgument = process.argv.indexOf('--data');
const dataDir = dataArgument >= 0 ? process.argv[dataArgument + 1] : process.env.DIDAU_LOCAL_DIR;
if (dataArgument >= 0 && (!dataDir || dataDir.startsWith('--'))) { console.error('Thiếu thư mục sau --data'); process.exit(1); }
const file = dataDir ? resolve(dataDir, 'nha.json') : fileURLToPath(new URL('../../local/nha.json', import.meta.url));
let server;
try { server = await startHome({ dist, file, port }); }
catch (failure) { console.error(failure.code === 'EADDRINUSE' ? `Cổng ${port} đang có chương trình khác dùng, thử cổng khác bằng --port` : 'Chưa bật được máy chủ'); process.exit(1); }
let closing = false;
const stop = () => { if (closing) return; closing = true; void server.stop().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, stop);
