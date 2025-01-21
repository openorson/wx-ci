import { defineConfig } from 'tsup'

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: ['src'],
    format: ['esm'],
    outDir: 'dist',
  },
])
