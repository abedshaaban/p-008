import type { Command } from 'commander'
import { cloneProject } from '../core/project'

export function registerCloneCommand(program: Command) {
  program
    .command('clone')
    .argument('<repo-url>', 'Git repository URL to clone')
    .description('Clone a Git repository into a workspace-ready project')
    .action(async (repoUrl: string) => {
      try {
        const result = await cloneProject({ repoUrl, cwd: process.cwd() })
        // Keep output simple and explicit
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
