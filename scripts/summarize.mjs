import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const out = fileURLToPath(new URL('../../docs/evidence/dd-app-0/', import.meta.url));
const read = async path => JSON.parse(await readFile(join(out, path), 'utf8'));
const own = await read('tu-kiem.json');
const samples = own.flatMap(run => run.measurements.map(measurement => ({ file: 'tu-kiem.json', ...measurement })));
const batches = [];
for (const folder of ['measure-hom-nay', 'measure-hai-may', 'measure-goi-y', 'measure-nha']) {
  const cases = await read(`${folder}/results.json`);
  batches.push({ folder, total: cases.length, passed: cases.filter(item => item.ok).length, failed: cases.filter(item => !item.ok).length });
  for (const name of await readdir(join(out, folder))) {
    if (!name.endsWith('.json') || name === 'results.json') continue;
    const data = await read(`${folder}/${name}`);
    samples.push(...(data.measurements || []).map(measurement => ({ file: `${folder}/${name}`, ...measurement })));
  }
}
const summary = { batches, byViewport: [], ports: [], visualReview: own.flatMap(run => run.shots.map(shot => `doi-chieu-${shot.file}`)) };
for (const width of [390, 1366]) {
  const measures = samples.filter(sample => sample.viewport.width === width);
  const worst = measures.reduce((left, right) => right.words > left.words ? right : left);
  const primary = measures.map(sample => ({ state: sample.state, file: sample.file, total: sample.buttons.filter(button => button.vermilion).length, perRegion: Math.max(0, sample.buttons.some(button => button.vermilion) ? 1 : 0, ...sample.errors.filter(error => error.rule === 'hai-nut-son').map(error => error.actions.length)) }));
  summary.byViewport.push({ width, statesMeasured: measures.length, worstWords: { state: worst.state, words: worst.words, file: worst.file }, worstPrimaryRegion: primary.reduce((left, right) => right.perRegion > left.perRegion ? right : left), worstPrimaryTotal: primary.reduce((left, right) => right.total > left.total ? right : left), minTargetHeight: Math.min(...measures.flatMap(sample => sample.buttons.map(button => button.height))), ruleFailures: Object.fromEntries([...new Set(measures.flatMap(sample => sample.errors.map(error => error.rule)))].map(rule => [rule, measures.flatMap(sample => sample.errors).filter(error => error.rule === rule).length])) });
}
for (const port of [4503, 4504]) {
  const free = await new Promise(resolve => { const server = createServer(); server.once('error', () => resolve(false)); server.listen(port, 'localhost', () => server.close(() => resolve(true))); });
  summary.ports.push({ port, free });
}
await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
for (const entry of await readdir(out, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(json|log)$/.test(entry.name)) continue;
  const file = join(entry.parentPath, entry.name);
  const text = await readFile(file, 'utf8');
  const redacted = text.replace(/([?&]token=)[^&"\s\\]+/g, '$1[đã ẩn]').replace(/(\\?"token\\?"\s*:\s*\\?")[^"\\]+/g, '$1[đã ẩn]');
  if (text !== redacted) await writeFile(file, redacted);
}
console.log(JSON.stringify(summary, null, 2));
