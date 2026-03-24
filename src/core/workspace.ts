import fs from 'node:fs/promises'
import path from 'node:path'
import { findProjectRoot } from '../utils/findProjectRoot'
import { loadState } from '../config/load'
import { saveState } from '../config/save'
import type { ProjectState } from '../config/types'
import { branchToFolderSlug, resolveSlugCollision } from '../utils/slug'
import {
  fetchLatest,
  ensureBaseBranchExists,
  ensureLocalBranch,
  createWorktree,
  remoteBranchExists,
  localBranchExists,
  syncLocalBranchToRemote,
  removeWorktree
} from '../git/repo'

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

  const state = await loadState(projectRoot)

  const baseBranch = baseBranchOverride ?? state.defaultBaseBranch

  const gitDir = path.join(projectRoot, '.gmd', 'repo.git')

  await fetchLatest(gitDir)
  await ensureBaseBranchExists(gitDir, baseBranch)
  const usedExistingRemoteBranch = await remoteBranchExists(gitDir, branchName)

  const desiredFolderName = folderName ? branchToFolderSlug(folderName) : branchToFolderSlug(branchName)
  const existingFolderNames = new Set(state.workspaces.map((w) => w.folderName))
  const resolvedFolderName = resolveSlugCollision(desiredFolderName, existingFolderNames)

  const existingBranch = state.workspaces.find((w) => w.branch === branchName)
  if (existingBranch) {
    throw new Error('branch already exists in a conflicting way')
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

  await ensureLocalBranch(gitDir, branchName, baseBranch, !usedExistingRemoteBranch)
  await createWorktree(gitDir, workspaceDir, branchName)

  const newEntry = {
    branch: branchName,
    folderName: resolvedFolderName,
    goal: (goal ?? '').trim()
  }

  const newState: ProjectState = {
    defaultBaseBranch: state.defaultBaseBranch,
    workspaces: [...state.workspaces, newEntry]
  }

  await saveState(projectRoot, newState)

  return {
    projectRoot,
    workspacePath: workspaceDir,
    branch: branchName,
    baseBranch,
    usedExistingRemoteBranch
  }
}

export async function showWorkspace(input: ShowWorkspaceInput): Promise<ShowWorkspaceResult> {
  const { branchName, folderName, cwd } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const existingBranch = state.workspaces.find((w) => w.branch === branchName)
  if (existingBranch) {
    throw new Error('branch is already displayed')
  }

  const gitDir = path.join(projectRoot, '.gmd', 'repo.git')
  await fetchLatest(gitDir)

  const hasRemoteBranch = await remoteBranchExists(gitDir, branchName)
  const hasLocalBranch = await localBranchExists(gitDir, branchName)
  if (!hasRemoteBranch && !hasLocalBranch) {
    throw new Error('branch was not found on origin or local refs')
  }

  if (hasRemoteBranch) {
    await syncLocalBranchToRemote(gitDir, branchName)
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

  await createWorktree(gitDir, workspaceDir, branchName)

  const newEntry = {
    branch: branchName,
    folderName: resolvedFolderName,
    goal: ''
  }

  const newState: ProjectState = {
    defaultBaseBranch: state.defaultBaseBranch,
    workspaces: [...state.workspaces, newEntry]
  }
  await saveState(projectRoot, newState)

  return {
    projectRoot,
    workspacePath: workspaceDir,
    branch: branchName,
    usedRemoteBranch: hasRemoteBranch
  }
}

export async function hideWorkspace(input: HideWorkspaceInput): Promise<HideWorkspaceResult> {
  const { branchName, cwd } = input

  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    throw new Error('not inside a gitmedaddy project')
  }

  const state = await loadState(projectRoot)
  const entry = state.workspaces.find((w) => w.branch === branchName)
  if (!entry) {
    throw new Error('branch is not currently displayed')
  }

  const gitDir = path.join(projectRoot, '.gmd', 'repo.git')
  const workspaceDir = path.join(projectRoot, entry.folderName)
  await removeWorktree(gitDir, workspaceDir)

  const newState: ProjectState = {
    defaultBaseBranch: state.defaultBaseBranch,
    workspaces: state.workspaces.filter((w) => w.branch !== branchName)
  }
  await saveState(projectRoot, newState)

  return {
    projectRoot,
    workspacePath: workspaceDir,
    branch: branchName
  }
}
