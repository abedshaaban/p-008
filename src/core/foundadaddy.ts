import fs from 'node:fs/promises'
import path from 'node:path'
import { git } from '../git/exec'
import {
  createWorktree,
  detectDefaultBranch,
  ensureLocalBranch,
  fetchLatest,
  listRemoteBranches,
  resolveGitCommonDir
} from '../git/repo'
import { saveState } from '../config/save'
import { promptSelect } from '../utils/prompt'
import { branchToFolderSlug } from '../utils/slug'
import type { ProjectState } from '../config/types'

export interface FoundADaddyInput {
  cwd: string
}

export interface FoundADaddyResult {
  projectRoot: string
  workspacePath: string
  defaultBaseBranch: string
}

export async function foundADaddy(input: FoundADaddyInput): Promise<FoundADaddyResult> {
  const { cwd } = input

  const { stdout } = await git(['rev-parse', '--show-toplevel'], { cwd })
  const projectRoot = stdout.trim()
  if (!projectRoot) {
    throw new Error('not inside a git repository')
  }

  const branchesPath = path.join(projectRoot, 'state', 'branches.json')
  try {
    await fs.access(branchesPath)
    throw new Error('gmd is already initialized in this repository')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  const commonDir = await resolveGitCommonDir(cwd)

  console.error('Fetching latest branches from origin...')
  await fetchLatest(commonDir, { inheritStdio: true })

  const detectedDefaultBranch = await detectDefaultBranch(commonDir)
  const remoteBranches = await listRemoteBranches(commonDir)
  const preferredDefault = remoteBranches.includes('main')
    ? 'main'
    : remoteBranches.includes(detectedDefaultBranch)
      ? detectedDefaultBranch
      : remoteBranches[0]!

  const defaultBaseBranch = await promptSelect(
    'Select your default base branch for new workspaces',
    remoteBranches,
    preferredDefault
  )

  await ensureLocalBranch(commonDir, defaultBaseBranch, defaultBaseBranch, true)

  const { stdout: headOut } = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot })
  const currentBranch = headOut.trim()

  let workspacePath: string
  let folderName: string

  if (currentBranch !== 'HEAD' && currentBranch === defaultBaseBranch) {
    workspacePath = projectRoot
    folderName = '.'
  } else {
    const workspaceFolderName = branchToFolderSlug(defaultBaseBranch)
    workspacePath = path.join(projectRoot, workspaceFolderName)
    try {
      await fs.mkdir(workspacePath, { recursive: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`workspace folder "${workspaceFolderName}" already exists`)
      }
      throw error
    }
    await createWorktree(commonDir, workspacePath, defaultBaseBranch)
    folderName = workspaceFolderName
  }

  const state: ProjectState = {
    defaultBaseBranch,
    workspaces: [
      {
        branch: defaultBaseBranch,
        folderName,
        goal: ''
      }
    ]
  }

  await saveState(projectRoot, state)

  return {
    projectRoot,
    workspacePath,
    defaultBaseBranch
  }
}
