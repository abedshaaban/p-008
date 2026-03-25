import { showWorkspace } from '../core/workspace'
import { branchToFolderSlug } from '../utils/slug'
import { promptInput, promptSelect } from '../utils/prompt'
import { loadState } from '../config/load'
import { resolveGitCommonDirFromState, fetchLatest, listLocalBranches, listRemoteBranches } from '../git/repo'
import { findProjectRoot } from '../utils/findProjectRoot'
import type { Command } from 'commander'

export function registerShowCommand(program: Command) {
  program
    .command('show')
    .alias('s')
    .argument('[branch-name]', 'Name of the existing branch to display (or select one)')
    .description('Display an existing branch as a workspace folder')
    .action(async (branchNameArg?: string) => {
      let branchNameToShow: string | undefined = branchNameArg
      try {
        if (!branchNameToShow) {
          const projectRoot = findProjectRoot(process.cwd())
          if (!projectRoot) {
            throw new Error('not inside a gitmedaddy project')
          }

          const state = await loadState(projectRoot)
          const gitDir = await resolveGitCommonDirFromState(projectRoot, state)

          // Ensure remote-tracking refs are up to date before listing them.
          await fetchLatest(gitDir)

          const visibleBranches = new Set(state.workspaces.map((w) => w.branch))
          const [remoteBranches, localBranches] = await Promise.all([
            listRemoteBranches(gitDir),
            listLocalBranches(gitDir)
          ])

          const options = Array.from(new Set([...localBranches, ...remoteBranches]))
            .filter((b) => b.trim() !== '')
            .filter((b) => b !== 'origin' && !b.startsWith('origin/'))
            .filter((b) => !visibleBranches.has(b))
            .sort((a, b) => a.localeCompare(b))

          if (options.length === 0) {
            throw new Error('no hidden branches available to show')
          }

          branchNameToShow = await promptSelect(
            'Select the branch to display',
            options,
            // If the default is currently visible, promptSelect will fall back to the first option.
            state.defaultBaseBranch
          )
        }

        if (!branchNameToShow) {
          throw new Error('no branch selected')
        }

        const defaultFolderName = branchToFolderSlug(branchNameToShow)
        const folderName = await promptInput('Workspace folder name', defaultFolderName)

        const result = await showWorkspace({
          branchName: branchNameToShow,
          folderName,
          cwd: process.cwd()
        })

        if (result.usedRemoteBranch) {
          console.log(`Using remote branch "${branchNameToShow}" and displaying it locally.`)
        } else {
          console.log(`Using local branch "${branchNameToShow}" and displaying it locally.`)
        }

        console.log(JSON.stringify(result, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred'
        if (message === 'branch was not found on origin or local refs') {
          console.warn(
            `\x1b[33mWarning: branch "${branchNameToShow ?? branchNameArg}" was not found. ` +
              `You can create it with: gmd new ${branchNameToShow ?? branchNameArg}\x1b[0m`
          )
          process.exitCode = 1
          return
        }

        console.error(message)
        process.exitCode = 1
      }
    })
}
