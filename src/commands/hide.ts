import type { Command } from 'commander'
import { hideWorkspace } from '../core/workspace'

export function registerHideCommand(program: Command) {
  program
    .command('hide')
    .alias('h')
    .argument('<branch-name>', 'Name of the displayed branch to hide')
    .description('Hide a displayed branch by removing its workspace folder')
    .action(async (branchName: string) => {
      try {
        const result = await hideWorkspace({
          branchName,
          cwd: process.cwd()
        })
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
