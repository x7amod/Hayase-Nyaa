import { build } from 'esbuild'

await build({
  entryPoints: ['hayase/src/runtime.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  outfile: 'hayase/nyaasi.js',
})
