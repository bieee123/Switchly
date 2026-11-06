import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2];

if (target !== 'chromium' && target !== 'firefox') {
  console.error('Usage: tsx scripts/build-manifest.ts <chromium|firefox>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve('manifest.base.json'), 'utf8')) as Record<
  string,
  unknown
>;

if (target === 'firefox') {
  manifest.browser_specific_settings = {
    gecko: {
      id: 'session-switcher@local',
      strict_min_version: '115.0',
      data_collection_permissions: {
        required: ['none'],
      },
    },
  };
}

const outDir = resolve('dist', target);
if (!existsSync(outDir)) {
  console.error(`Build output not found: ${outDir}`);
  process.exit(1);
}

// Vite preserves the source directory for HTML entries. The extension expects
// popup.html and import.html at the package root.
for (const page of ['popup', 'import']) {
  const nested = resolve(outDir, page, `${page}.html`);
  const flat = resolve(outDir, `${page}.html`);
  if (existsSync(nested)) renameSync(nested, flat);
  rmSync(resolve(outDir, page), { recursive: true, force: true });
}

writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote dist/${target}/manifest.json`);
