import { hideWorkspace } from '../core/workspace'
import { loadState } from '../config/load'
import { findProjectRoot } from '../utils/findProjectRoot'
import { promptSelect } from '../utils/prompt'
import type { Command } from 'commander'

export function registerHideCommand(program: Command) {
  program
    .command('hide')
    .alias('h')
    .argument('[branch-name]', 'Name of the displayed branch to hide (or select one)')
    .description('Hide a displayed branch by removing its workspace folder')
    .action(async (branchNameArg?: string) => {
      try {
        let branchName = branchNameArg

        if (!branchName) {
          const projectRoot = findProjectRoot(process.cwd())
          if (!projectRoot) {
            throw new Error('not inside a gitmedaddy project')
          }

          const state = await loadState(projectRoot)
          const visibleSelectable = state.workspaces.filter((w) => w.folderName !== '.')

          const choices = visibleSelectable.map((w) => `${w.folderName} ${w.branch}`)
          if (choices.length === 0) {
            throw new Error('no displayed branches available to hide')
          }

          const defaultChoice =
            visibleSelectable.find((w) => w.branch === state.defaultBaseBranch) ?? visibleSelectable[0]!

          const selectedLabel = await promptSelect(
            'Select the branch to hide',
            choices,
            `${defaultChoice.folderName} ${defaultChoice.branch}`
          )

          const spaceIndex = selectedLabel.indexOf(' ')
          if (spaceIndex === -1) {
            throw new Error('internal error: could not parse selected branch')
          }
          branchName = selectedLabel.slice(spaceIndex + 1)
        }

        const result = await hideWorkspace({
          branchName: branchName,
          cwd: process.cwd()
        })

        console.log(JSON.stringify(result, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred'

        console.error(message)
        process.exitCode = 1
      }
    })
}
