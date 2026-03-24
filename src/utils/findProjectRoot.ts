import path from 'node:path'
import fs from 'node:fs'

export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir)

  // Walk upwards until we find .gmd/config.json or hit filesystem root
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const configPath = path.join(current, '.gmd', 'config.json')
    if (fs.existsSync(configPath)) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }

    current = parent
  }
}
