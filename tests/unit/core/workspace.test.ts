import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNewWorkspace } from '../../../src/core/workspace'
import { createTempDir } from '../../helpers/tempDir'

vi.mock('../../../src/utils/findProjectRoot', () => ({
  findProjectRoot: vi.fn()
}))

vi.mock('../../../src/config/load', () => ({
  loadState: vi.fn()
}))

vi.mock('../../../src/config/save', () => ({
  saveState: vi.fn(),
  withStateLock: vi.fn()
}))

vi.mock('../../../src/git/repo', () => ({
  createWorktree: vi.fn(),
  ensureBaseBranchExists: vi.fn(),
  ensureLocalBranch: vi.fn(),
  fetchLatest: vi.fn(),
  isPrimaryWorktree: vi.fn(),
  listRemoteBranches: vi.fn(),
  localBranchExists: vi.fn(),
  remoteBranchExists: vi.fn(),
  removeWorktree: vi.fn(),
  resolveGitCommonDirFromState: vi.fn()
}))

import { loadState } from '../../../src/config/load'
import { saveState, withStateLock } from '../../../src/config/save'
import {
  createWorktree,
  ensureBaseBranchExists,
  ensureLocalBranch,
  fetchLatest,
  remoteBranchExists,
  resolveGitCommonDirFromState
} from '../../../src/git/repo'
import { findProjectRoot } from '../../../src/utils/findProjectRoot'

const tempDirs: Array<string> = []

describe('createNewWorkspace', () => {
  beforeEach(() => {
    vi.mocked(findProjectRoot).mockReset()
    vi.mocked(loadState).mockReset()
    vi.mocked(saveState).mockReset()
    vi.mocked(withStateLock).mockReset()
    vi.mocked(fetchLatest).mockReset()
    vi.mocked(ensureBaseBranchExists).mockReset()
    vi.mocked(remoteBranchExists).mockReset()
    vi.mocked(ensureLocalBranch).mockReset()
    vi.mocked(createWorktree).mockReset()
    vi.mocked(resolveGitCommonDirFromState).mockReset()

    vi.mocked(withStateLock).mockImplementation(async (_projectRoot, fn) => fn())
  })

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('rejects when not inside a gitmedaddy project', async () => {
    vi.mocked(findProjectRoot).mockReturnValue(null)

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: '/tmp/outside' })).rejects.toThrow(
      'not inside a gitmedaddy project'
    )
  })

  it('creates a workspace, resolves folder collisions, and trims the goal', async () => {
    const projectRoot = await createTempDir('workspace-project')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'feature-demo', goal: 'base' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)

    const result = await createNewWorkspace({
      branchName: 'feature/demo',
      goal: '  ship it  ',
      cwd: path.join(projectRoot, 'feature-demo')
    })

    expect(fetchLatest).toHaveBeenCalledWith('/tmp/project/.git')
    expect(ensureBaseBranchExists).toHaveBeenCalledWith('/tmp/project/.git', 'main')
    expect(ensureLocalBranch).toHaveBeenCalledWith('/tmp/project/.git', 'feature/demo', 'main', true)
    expect(createWorktree).toHaveBeenCalledWith(
      '/tmp/project/.git',
      path.join(projectRoot, 'feature-demo-a'),
      'feature/demo'
    )
    expect(saveState).toHaveBeenCalledWith(projectRoot, {
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [
        { branch: 'main', folderName: 'feature-demo', goal: 'base' },
        { branch: 'feature/demo', folderName: 'feature-demo-a', goal: 'ship it' }
      ]
    })
    expect(result).toEqual({
      projectRoot,
      workspacePath: path.join(projectRoot, 'feature-demo-a'),
      branch: 'feature/demo',
      baseBranch: 'main',
      usedExistingRemoteBranch: false
    })
  })

  it('uses the override base branch and marks an existing remote branch correctly', async () => {
    const projectRoot = await createTempDir('workspace-project-override')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(true)

    const result = await createNewWorkspace({
      branchName: 'release/1.0',
      baseBranchOverride: 'develop',
      cwd: projectRoot
    })

    expect(ensureBaseBranchExists).toHaveBeenCalledWith('/tmp/project/.git', 'develop')
    expect(ensureLocalBranch).toHaveBeenCalledWith('/tmp/project/.git', 'release/1.0', 'develop', false)
    expect(result.usedExistingRemoteBranch).toBe(true)
    expect(result.baseBranch).toBe('develop')
  })

  it('slugifies a custom folder name and trims a blank goal to an empty string', async () => {
    const projectRoot = await createTempDir('workspace-project-custom-folder')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'my-folder', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)

    const result = await createNewWorkspace({
      branchName: 'feature/demo',
      folderName: 'My Folder!!!',
      goal: '   ',
      cwd: projectRoot
    })

    expect(createWorktree).toHaveBeenCalledWith(
      '/tmp/project/.git',
      path.join(projectRoot, 'My-Folder'),
      'feature/demo'
    )
    expect(result.workspacePath).toBe(path.join(projectRoot, 'My-Folder'))
    expect(saveState).toHaveBeenLastCalledWith(projectRoot, {
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [
        { branch: 'main', folderName: 'my-folder', goal: '' },
        { branch: 'feature/demo', folderName: 'My-Folder', goal: '' }
      ]
    })
  })

  it('bubbles base branch validation failures before creating the folder', async () => {
    const projectRoot = await createTempDir('workspace-project-base-branch-fail')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(ensureBaseBranchExists).mockRejectedValue(new Error('base branch not found'))

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: projectRoot })).rejects.toThrow(
      'base branch not found'
    )
    await expect(fs.access(path.join(projectRoot, 'feature-demo'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects when the branch is already displayed', async () => {
    const projectRoot = await createTempDir('workspace-project-duplicate')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'feature/demo', folderName: 'feature-demo', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: projectRoot })).rejects.toThrow(
      'branch "feature/demo" is already displayed'
    )
  })

  it('rejects when the target folder already exists on disk', async () => {
    const projectRoot = await createTempDir('workspace-project-folder-exists')
    tempDirs.push(projectRoot)

    const existingFolder = path.join(projectRoot, 'feature-demo')
    await fs.mkdir(existingFolder)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: projectRoot })).rejects.toThrow(
      'workspace folder already exists'
    )
  })

  it('removes the workspace directory if worktree creation fails', async () => {
    const projectRoot = await createTempDir('workspace-project-cleanup')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)
    vi.mocked(createWorktree).mockRejectedValue(new Error('worktree add failed'))

    const workspaceDir = path.join(projectRoot, 'feature-demo')

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: projectRoot })).rejects.toThrow(
      'worktree add failed'
    )
    await expect(fs.access(workspaceDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(saveState).not.toHaveBeenCalled()
  })

  it('removes the workspace directory if local branch preparation fails', async () => {
    const projectRoot = await createTempDir('workspace-project-branch-fail')
    tempDirs.push(projectRoot)

    vi.mocked(findProjectRoot).mockReturnValue(projectRoot)
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(remoteBranchExists).mockResolvedValue(false)
    vi.mocked(ensureLocalBranch).mockRejectedValue(new Error('branch creation failed'))

    const workspaceDir = path.join(projectRoot, 'feature-demo')

    await expect(createNewWorkspace({ branchName: 'feature/demo', cwd: projectRoot })).rejects.toThrow(
      'branch creation failed'
    )
    await expect(fs.access(workspaceDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(createWorktree).not.toHaveBeenCalled()
    expect(saveState).not.toHaveBeenCalled()
  })
})
