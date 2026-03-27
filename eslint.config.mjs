import { tanstackConfig } from '@tanstack/eslint-config'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'vitest.config.ts', 'tsup.config.ts'] },
  ...tanstackConfig,
  prettier,
  {
    rules: {
      semi: ['warn', 'never'],
      quotes: ['warn', 'single', { avoidEscape: true }]
    }
  }
]
