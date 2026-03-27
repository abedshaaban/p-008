import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts'
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node18',
  bundle: true,
  minify: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  clean: true,
  outDir: 'dist',
  outExtension() {
    return {
      js: '.js'
    }
  },
  banner: {
    js: '#!/usr/bin/env node'
  },
  skipNodeModulesBundle: true
})
