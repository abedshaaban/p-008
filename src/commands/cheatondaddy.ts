import type { Command } from 'commander'
import { cheatOnDaddy } from '../core/cheatondaddy'

export function registerCheatOnDaddyCommand(program: Command) {
  program
    .command('cheatondaddy')
    .description('Undo gmd workspace layout and restore a normal git repository')
    .action(async () => {
      try {
        const result = await cheatOnDaddy({ cwd: process.cwd() })
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred'
        // eslint-disable-next-line no-console
        console.error(message)
        process.exitCode = 1
      }
    })
}
