import fs from 'node:fs/promises'
import path from 'node:path'
import { loadState } from '../config/load'
import { git } from '../git/exec'
import { removeWorktree } from '../git/repo'
import { findProjectRoot } from '../utils/findProjectRoot'

export interface CheatOnDaddyInput {
  cwd: string
}

export interface CheatOnDaddyResult {
  projectRoot: string
  restoredBranch: string
  removedWorkspaces: string[]
}

export async function cheatOnDaddy(input: CheatOnDaddyInput): Promise<CheatOnDaddyResult> {
  const { cwd } = input
  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const restoredBranch = state.defaultBaseBranch
  const restoredWorkspace = state.workspaces.find((workspace) => workspace.branch === restoredBranch)
  if (!restoredWorkspace) {
    throw new Error(`default base branch "${restoredBranch}" is not currently displayed`)
  }

  const gmdDir = path.join(projectRoot, '.gmd')
  const bareGitDir = path.join(gmdDir, 'repo.git')
  const stateDir = path.join(projectRoot, 'state')
  const normalGitDir = path.join(projectRoot, '.git')

  await fs.access(bareGitDir)

  const removedWorkspaces: string[] = []
  for (const workspace of state.workspaces) {
    if (workspace.branch === restoredBranch) continue
    const workspacePath = path.join(projectRoot, workspace.folderName)
    await removeWorktree(bareGitDir, workspacePath)
    removedWorkspaces.push(workspace.branch)
  }

  const restoredWorkspacePath = path.join(projectRoot, restoredWorkspace.folderName)
  await removeWorktree(bareGitDir, restoredWorkspacePath)

  // Replace any legacy root .git with the gmd-managed bare git directory.
  await fs.rm(normalGitDir, { recursive: true, force: true })
  await fs.rename(bareGitDir, normalGitDir)

  await git(['config', 'core.bare', 'false'], { gitDir: normalGitDir })
  await git(['config', 'core.worktree', projectRoot], { gitDir: normalGitDir })

  await git(['checkout', '-f', restoredBranch], { gitDir: normalGitDir, cwd: projectRoot })

  await fs.rm(restoredWorkspacePath, { recursive: true, force: true })
  await fs.rm(stateDir, { recursive: true, force: true })
  await fs.rm(gmdDir, { recursive: true, force: true })

  return {
    projectRoot,
    restoredBranch,
    removedWorkspaces
  }
}
