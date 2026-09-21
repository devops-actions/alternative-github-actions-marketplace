import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * The `vscode` module is provided by the host at runtime and must never be
 * bundled. Everything else is inlined so the packaged extension is a single file
 * with no node_modules to ship.
 */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
