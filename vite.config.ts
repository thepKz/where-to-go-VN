import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

// Viết service worker vào thư mục dựng: danh sách tệp đệm sẵn và số phiên bản theo nội dung.
function offlineWorker(): Plugin {
  let root = '', outDir = ''
  return {
    name: 'di-dau-offline-worker',
    apply: 'build',
    configResolved(config) { root = config.root; outDir = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else files.push(full) } }
      walk(outDir)
      const urls = files.map(file => '/' + relative(outDir, file).split(sep).join('/'))
        .filter(url => !/^\/(sw|service-worker)\.js$/.test(url) && !url.endsWith('.map') && !(url.endsWith('.woff') && !url.endsWith('.woff2')))
        .sort()
      const hash = createHash('sha256')
      for (const url of urls) hash.update(url).update(readFileSync(join(outDir, url)))
      const source = readFileSync(resolve(root, 'src/pwa/sw-source.js'), 'utf8')
      writeFileSync(join(outDir, 'service-worker.js'), source.replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__PRECACHE__', JSON.stringify(['/', ...urls], null, 1)))
    }
  }
}

// Tên cũ của biến dựng chế độ nhà: VITE_SYNC_SAME_ORIGIN=1 giống VITE_SYNC_URL=cung-goc.
if (process.env.VITE_SYNC_SAME_ORIGIN === '1') process.env.VITE_SYNC_URL = 'cung-goc'

export default defineConfig({ plugins: [react(), offlineWorker()], server: { strictPort: true } })
