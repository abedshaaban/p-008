import fs from 'node:fs/promises'
import path from 'node:path'
import { findProjectRoot } from '../utils/findProjectRoot'
import { promptSelect } from '../utils/prompt'
import { loadState } from '../config/load'
import { saveState, withStateLock } from '../config/save'
import { branchToFolderSlug, resolveSlugCollision } from '../utils/slug'
import {
  createWorktree,
  ensureBaseBranchExists,
  ensureLocalBranch,
  fetchLatest,
  isPrimaryWorktree,
  listRemoteBranches,
  localBranchExists,
  remoteBranchExists,
  removeWorktree,
  resolveGitCommonDirFromState
} from '../git/repo'
import { git } from '../git/exec'
import type { ProjectSettings, ProjectState } from '../config/types'

export interface CreateNewWorkspaceInput {
  branchName: string
  baseBranchOverride?: string | undefined
  folderName?: string | undefined
  goal?: string | undefined
  cwd: string
}

export interface CreateNewWorkspaceResult {
  projectRoot: string
  workspacePath: string
  branch: string
  baseBranch: string
  usedExistingRemoteBranch: boolean
}

export interface ShowWorkspaceInput {
  branchName: string
  folderName?: string | undefined
  cwd: string
}

export interface ShowWorkspaceResult {
  projectRoot: string
  workspacePath: string
  branch: string
  usedRemoteBranch: boolean
}

export interface HideWorkspaceInput {
  branchName: string
  cwd: string
}

export interface HideWorkspaceResult {
  projectRoot: string
  workspacePath: string
  branch: string
  hidden: boolean
}

export interface CleanWorkspacesInput {
  cwd: string
  keepBranch?: string | undefined
}

export interface CleanWorkspacesResult {
  projectRoot: string
  keptBranch: string
  preservedBranches: Array<string>
  removedBranches: Array<string>
}

export interface PullWorkspacesInput {
  cwd: string
  all?: boolean | undefined
}

export interface PullWorkspacesResult {
  projectRoot: string
  pulledBranches: Array<string>
  failedBranches: Array<{ branch: string; error: string }>
}

export interface MergeWorkspaceInput {
  cwd: string
  fromBranch?: string | undefined
  toBranch?: string | undefined
}

export interface MergeWorkspaceResult {
  projectRoot: string
  sourceBranch: string
  targetBranch: string
}

export interface SetWorkspaceGoalInput {
  cwd: string
  goal: string
  branchName?: string | undefined
}

export interface SetWorkspaceGoalResult {
  projectRoot: string
  branch: string
  goal: string
}

export interface ShowWorkspaceGoalInput {
  cwd: string
  branchName?: string | undefined
}

export interface ShowWorkspaceGoalResult {
  projectRoot: string
  branch: string
  goal: string
}

export interface UpdateDefaultBaseBranchInput {
  cwd: string
  interactive: boolean
  baseBranchOverride?: string | undefined
  settingsOverrides?: Partial<ProjectSettings> | undefined
}

export interface UpdateDefaultBaseBranchResult {
  projectRoot: string
  previousDefaultBaseBranch: string
  defaultBaseBranch: string
  settings: ProjectSettings
}

function resolveCurrentWorkspaceBranch(projectRoot: string, cwd: string, state: ProjectState): string | null {
  const absoluteCwd = path.resolve(cwd)
  let best: { branch: string; root: string } | null = null
  for (const workspace of state.workspaces) {
    const workspaceRoot = path.resolve(path.join(projectRoot, workspace.folderName))
    const relative = path.relative(workspaceRoot, absoluteCwd)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      if (!best || workspaceRoot.length > best.root.length) {
        best = { branch: workspace.branch, root: workspaceRoot }
      }
    }
  }
  return best?.branch ?? null
}

function getWorkspacePath(projectRoot: string, state: ProjectState, branch: string): string {
  const workspace = state.workspaces.find((w) => w.branch === branch)
  if (!workspace) {
    throw new Error(`branch "${branch}" is not currently displayed`)
  }
  return path.join(projectRoot, workspace.folderName)
}

function resolveVisibleBranch(projectRoot: string, cwd: string, state: ProjectState, branchName?: string): string {
  if (branchName) {
    const exists = state.workspaces.some((w) => w.branch === branchName)
    if (!exists) {
      throw new Error(`branch "${branchName}" is hidden; show it before setting or viewing a goal`)
    }
    return branchName
  }

  const currentBranch = resolveCurrentWorkspaceBranch(projectRoot, cwd, state)
  if (!currentBranch) {
    throw new Error('current directory is not inside a displayed workspace; pass a branch name')
  }
  return currentBranch
}

/**
 * Creates a workspace for the requested branch.
 *
 * Flow:
 * 1) Resolve project root and load `state/branches.json`.
 * 2) Fetch latest refs from origin before any branch checks.
 * 3) If target branch exists on origin, use it locally; otherwise create it from base branch.
 * 4) Create a new worktree folder for the branch.
 * 5) Persist the new workspace entry back into state.
 */
export async function createNewWorkspace(input: CreateNewWorkspaceInput): Promise<CreateNewWorkspaceResult> {
  const { branchName, baseBranchOverride, folderName, goal, cwd } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const baseBranch = baseBranchOverride ?? state.defaultBaseBranch
    const gitDir = await resolveGitCommonDirFromState(projectRoot, state)

    await fetchLatest(gitDir)
    await ensureBaseBranchExists(gitDir, baseBranch)

    const usedExistingRemoteBranch = await remoteBranchExists(gitDir, branchName)
    const desiredFolderName = folderName ? branchToFolderSlug(folderName) : branchToFolderSlug(branchName)
    const existingFolderNames = new Set(state.workspaces.map((w) => w.folderName))
    const resolvedFolderName = resolveSlugCollision(desiredFolderName, existingFolderNames)

    if (state.workspaces.some((w) => w.branch === branchName)) {
      throw new Error(`branch "${branchName}" is already displayed`)
    }

    const workspaceDir = path.join(projectRoot, resolvedFolderName)
    try {
      await fs.mkdir(workspaceDir, { recursive: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('workspace folder already exists')
      }
      throw error
    }

    try {
      await ensureLocalBranch(gitDir, branchName, baseBranch, !usedExistingRemoteBranch)
      await createWorktree(gitDir, workspaceDir, branchName)
    } catch (error) {
      await fs.rm(workspaceDir, { recursive: true, force: true })
      throw error
    }

    const newState: ProjectState = {
      defaultBaseBranch: state.defaultBaseBranch,
      settings: state.settings,
      workspaces: [
        ...state.workspaces,
        {
          branch: branchName,
          folderName: resolvedFolderName,
          goal: (goal ?? '').trim()
        }
      ]
    }

    await saveState(projectRoot, newState)

    return {
      projectRoot,
      workspacePath: workspaceDir,
      branch: branchName,
      baseBranch,
      usedExistingRemoteBranch
    }
  })
}

export async function showWorkspace(input: ShowWorkspaceInput): Promise<ShowWorkspaceResult> {
  const { branchName, folderName, cwd } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const existingBranch = state.workspaces.find((w) => w.branch === branchName)
    if (existingBranch) {
      throw new Error('branch is already displayed')
    }

    const gitDir = await resolveGitCommonDirFromState(projectRoot, state)
    await fetchLatest(gitDir)

    const hasRemoteBranch = await remoteBranchExists(gitDir, branchName)
    const hasLocalBranch = await localBranchExists(gitDir, branchName)
    if (!hasRemoteBranch && !hasLocalBranch) {
      throw new Error(
        `branch "${branchName}" was not found on origin or local refs; create it with: gmd new ${branchName}`
      )
    }

    const desiredFolderName = folderName ? branchToFolderSlug(folderName) : branchToFolderSlug(branchName)
    const existingFolderNames = new Set(state.workspaces.map((w) => w.folderName))
    const resolvedFolderName = resolveSlugCollision(desiredFolderName, existingFolderNames)
    const workspaceDir = path.join(projectRoot, resolvedFolderName)

    try {
      await fs.mkdir(workspaceDir, { recursive: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('workspace folder already exists')
      }
      throw error
    }

    try {
      await ensureLocalBranch(gitDir, branchName, state.defaultBaseBranch, false)
      await createWorktree(gitDir, workspaceDir, branchName)
    } catch (error) {
      await fs.rm(workspaceDir, { recursive: true, force: true })
      throw error
    }

    const newState: ProjectState = {
      defaultBaseBranch: state.defaultBaseBranch,
      settings: state.settings,
      workspaces: [
        ...state.workspaces,
        {
          branch: branchName,
          folderName: resolvedFolderName,
          goal: ''
        }
      ]
    }
    await saveState(projectRoot, newState)

    return {
      projectRoot,
      workspacePath: workspaceDir,
      branch: branchName,
      usedRemoteBranch: hasRemoteBranch
    }
  })
}

export async function hideWorkspace(input: HideWorkspaceInput): Promise<HideWorkspaceResult> {
  const { branchName, cwd } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const entry = state.workspaces.find((w) => w.branch === branchName)
    if (!entry) {
      throw new Error('branch is not currently displayed')
    }

    const gitDir = await resolveGitCommonDirFromState(projectRoot, state)
    const workspaceDir = path.join(projectRoot, entry.folderName)
    if (entry.folderName === '.' || (await isPrimaryWorktree(gitDir, workspaceDir))) {
      return {
        projectRoot,
        workspacePath: workspaceDir,
        branch: branchName,
        hidden: false
      }
    }
    await removeWorktree(gitDir, workspaceDir)

    const newState: ProjectState = {
      defaultBaseBranch: state.defaultBaseBranch,
      settings: state.settings,
      workspaces: state.workspaces.filter((w) => w.branch !== branchName)
    }
    await saveState(projectRoot, newState)

    return {
      projectRoot,
      workspacePath: workspaceDir,
      branch: branchName,
      hidden: true
    }
  })
}

export async function cleanWorkspaces(input: CleanWorkspacesInput): Promise<CleanWorkspacesResult> {
  const { cwd, keepBranch } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const initialState = await loadState(projectRoot)
  const gitDir = await resolveGitCommonDirFromState(projectRoot, initialState)
  await fetchLatest(gitDir)
  const targetKeepBranch = keepBranch ?? initialState.defaultBaseBranch

  const isDisplayed = initialState.workspaces.some((w) => w.branch === targetKeepBranch)
  if (!isDisplayed) {
    await showWorkspace({
      branchName: targetKeepBranch,
      cwd
    })
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const keptWorkspaces: Array<ProjectState['workspaces'][number]> = []
    const removedBranches: Array<string> = []

    for (const workspace of state.workspaces) {
      const workspaceDir = path.join(projectRoot, workspace.folderName)
      const isPrimary = workspace.folderName === '.' || (await isPrimaryWorktree(gitDir, workspaceDir))

      if (workspace.branch === targetKeepBranch || isPrimary) {
        keptWorkspaces.push(workspace)
        continue
      }

      await removeWorktree(gitDir, workspaceDir)
      removedBranches.push(workspace.branch)
    }

    const preservedBranches = Array.from(new Set(keptWorkspaces.map((workspace) => workspace.branch)))
    if (!preservedBranches.includes(targetKeepBranch)) {
      throw new Error('keep branch is missing from workspaces')
    }

    const newState: ProjectState = {
      defaultBaseBranch: state.defaultBaseBranch,
      settings: state.settings,
      workspaces: keptWorkspaces
    }
    await saveState(projectRoot, newState)

    return {
      projectRoot,
      keptBranch: targetKeepBranch,
      preservedBranches,
      removedBranches
    }
  })
}

export async function pullWorkspaces(input: PullWorkspacesInput): Promise<PullWorkspacesResult> {
  const { cwd, all = false } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const gitDir = await resolveGitCommonDirFromState(projectRoot, state)
  await fetchLatest(gitDir)
  const branches = all
    ? state.workspaces.map((w) => w.branch)
    : (() => {
        const currentBranch = resolveCurrentWorkspaceBranch(projectRoot, cwd, state)
        if (!currentBranch) {
          throw new Error('current directory is not inside a displayed workspace')
        }
        return [currentBranch]
      })()

  const pulledBranches: Array<string> = []
  const failedBranches: Array<{ branch: string; error: string }> = []

  for (const branch of branches) {
    const workspacePath = getWorkspacePath(projectRoot, state, branch)
    try {
      await git(['pull', 'origin', branch], { cwd: workspacePath })
      pulledBranches.push(branch)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      failedBranches.push({ branch, error: message })
    }
  }

  return {
    projectRoot,
    pulledBranches,
    failedBranches
  }
}

export async function mergeWorkspace(input: MergeWorkspaceInput): Promise<MergeWorkspaceResult> {
  const { cwd, fromBranch, toBranch } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const currentBranch = resolveCurrentWorkspaceBranch(projectRoot, cwd, state)

  const targetBranch = toBranch ?? currentBranch
  if (!targetBranch) {
    throw new Error('current directory is not inside a displayed workspace')
  }

  const sourceBranch = fromBranch ?? state.defaultBaseBranch
  const gitDir = await resolveGitCommonDirFromState(projectRoot, state)

  await fetchLatest(gitDir)

  const targetPath = getWorkspacePath(projectRoot, state, targetBranch)
  if (!fromBranch) {
    await ensureBaseBranchExists(gitDir, sourceBranch)
    await git(['merge', '--ff-only', `refs/remotes/origin/${sourceBranch}`], { cwd: targetPath })
  } else {
    const hasLocalBranch = await localBranchExists(gitDir, sourceBranch)
    const hasRemoteBranch = await remoteBranchExists(gitDir, sourceBranch)

    if (!hasLocalBranch && !hasRemoteBranch) {
      throw new Error(`source branch "${sourceBranch}" was not found`)
    }

    await git(['merge', hasLocalBranch ? sourceBranch : `refs/remotes/origin/${sourceBranch}`], { cwd: targetPath })
  }

  return {
    projectRoot,
    sourceBranch,
    targetBranch
  }
}

export async function setWorkspaceGoal(input: SetWorkspaceGoalInput): Promise<SetWorkspaceGoalResult> {
  const { cwd, goal, branchName } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const targetBranch = resolveVisibleBranch(projectRoot, cwd, state, branchName)

    const newState: ProjectState = {
      defaultBaseBranch: state.defaultBaseBranch,
      settings: state.settings,
      workspaces: state.workspaces.map((w) =>
        w.branch === targetBranch
          ? {
              ...w,
              goal: goal.trim()
            }
          : w
      )
    }
    await saveState(projectRoot, newState)

    return {
      projectRoot,
      branch: targetBranch,
      goal: goal.trim()
    }
  })
}

export async function showWorkspaceGoal(input: ShowWorkspaceGoalInput): Promise<ShowWorkspaceGoalResult> {
  const { cwd, branchName } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const targetBranch = resolveVisibleBranch(projectRoot, cwd, state, branchName)
  const entry = state.workspaces.find((w) => w.branch === targetBranch)
  if (!entry) {
    throw new Error(`branch "${targetBranch}" is hidden; show it before setting or viewing a goal`)
  }

  return {
    projectRoot,
    branch: targetBranch,
    goal: entry.goal
  }
}

export async function updateDefaultBaseBranch(
  input: UpdateDefaultBaseBranchInput
): Promise<UpdateDefaultBaseBranchResult> {
  const { cwd, interactive, baseBranchOverride, settingsOverrides } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  return withStateLock(projectRoot, async () => {
    const state = await loadState(projectRoot)
    const gitDir = await resolveGitCommonDirFromState(projectRoot, state)

    await fetchLatest(gitDir, { inheritStdio: interactive })

    const remoteBranches = await listRemoteBranches(gitDir)
    if (remoteBranches.length === 0) {
      throw new Error('no remote branches found')
    }

    const defaultBaseBranch = baseBranchOverride
      ? baseBranchOverride
      : interactive
        ? await promptSelect('Select default base branch for new workspaces', remoteBranches, state.defaultBaseBranch)
        : state.defaultBaseBranch

    await ensureBaseBranchExists(gitDir, defaultBaseBranch)

    const nextSettings: ProjectSettings = interactive
      ? {
          json:
            settingsOverrides?.json ??
            (await promptSelect(
              'Select default output mode',
              ['json', 'text'],
              state.settings.json ? 'json' : 'text'
            )) === 'json',
          interactive:
            settingsOverrides?.interactive ??
            (await promptSelect(
              'Select default command mode',
              ['interactive', 'non-interactive'],
              state.settings.interactive ? 'interactive' : 'non-interactive'
            )) === 'interactive'
        }
      : {
          json: settingsOverrides?.json ?? state.settings.json,
          interactive: settingsOverrides?.interactive ?? state.settings.interactive
        }

    const newState: ProjectState = {
      ...state,
      defaultBaseBranch,
      settings: nextSettings
    }
    await saveState(projectRoot, newState)

    return {
      projectRoot,
      previousDefaultBaseBranch: state.defaultBaseBranch,
      defaultBaseBranch,
      settings: nextSettings
    }
  })
}
