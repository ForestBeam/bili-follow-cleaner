import { build, context } from 'esbuild';
import { copyFile, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const options = {
  entryPoints: [
    { in: 'src/background/index.ts', out: 'background' },
    { in: 'src/content-ui/index.ts', out: 'content-ui' },
    { in: 'src/content-main/main.ts', out: 'content-main' },
  ],
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  logLevel: 'info',
  sourcemap: false,
};

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  await copyFile('manifest.json', `${outdir}/manifest.json`);
  if (existsSync('src/assets')) {
    await cp('src/assets', `${outdir}/assets`, { recursive: true });
  }
}

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  await copyStatic();
  console.log('[build] watching for changes...');
} else {
  await build(options);
  await copyStatic();
  console.log('[build] done');
}
