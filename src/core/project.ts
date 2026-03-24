import fs from 'node:fs/promises'
import path from 'node:path'
import {
  initBareRepo,
  detectDefaultBranch,
  ensureLocalBranch,
  createWorktree,
  fetchLatest,
  listRemoteBranches
} from '../git/repo'
import { saveConfig, saveState } from '../config/save'
import type { ProjectConfig, ProjectState } from '../config/types'
import { promptSelect } from '../utils/prompt'

export interface CloneProjectInput {
  repoUrl: string
  cwd: string
}

export interface CloneProjectResult {
  projectRoot: string
  workspacePath: string
  defaultBranch: string
}

function inferProjectNameFromUrl(repoUrl: string): string {
  try {
    const url = new URL(repoUrl)
    const pathname = url.pathname.replace(/\/+$/, '')
    const last = pathname.split('/').filter(Boolean).pop() ?? 'project'
    return last.replace(/\.git$/i, '') || 'project'
  } catch {
    if (!repoUrl.includes('/')) {
      throw new Error('invalid repo URL')
    }
    const withoutTrailingSlash = repoUrl.replace(/\/+$/, '')
    const last = withoutTrailingSlash.split('/').filter(Boolean).pop() ?? 'project'
    return last.replace(/\.git$/i, '') || 'project'
  }
}

export async function cloneProject(input: CloneProjectInput): Promise<CloneProjectResult> {
  const { repoUrl, cwd } = input

  const projectName = inferProjectNameFromUrl(repoUrl)
  const projectRoot = path.join(cwd, projectName)

  try {
    await fs.mkdir(projectRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('target project folder already exists')
    }
    throw error
  }

  const entries = await fs.readdir(projectRoot)
  if (entries.length > 0) {
    throw new Error('target folder is not empty')
  }

  const gitDir = await initBareRepo(projectRoot, repoUrl)

  const detectedDefaultBranch = await detectDefaultBranch(gitDir)
  await fetchLatest(gitDir)
  const remoteBranches = await listRemoteBranches(gitDir)

  const preferredDefault = remoteBranches.includes('main')
    ? 'main'
    : remoteBranches.includes(detectedDefaultBranch)
      ? detectedDefaultBranch
      : remoteBranches[0]!
  const defaultBranch = await promptSelect(
    'Select your default base branch for new workspaces',
    remoteBranches,
    preferredDefault
  )

  await ensureLocalBranch(gitDir, defaultBranch, defaultBranch, true)

  const workspaceDir = path.join(projectRoot, defaultBranch)
  await fs.mkdir(workspaceDir, { recursive: true })

  await createWorktree(gitDir, workspaceDir, defaultBranch)

  const config: ProjectConfig = {
    version: 1,
    projectName,
    remote: 'origin',
    defaultBaseBranch: defaultBranch
  }

  const state: ProjectState = {
    defaultBaseBranch: defaultBranch,
    workspaces: [
      {
        branch: defaultBranch,
        folderName: defaultBranch,
        goal: 'Initial default workspace'
      }
    ]
  }

  await saveConfig(projectRoot, config)
  await saveState(projectRoot, state)

  return {
    projectRoot,
    workspacePath: workspaceDir,
    defaultBranch
  }
}
