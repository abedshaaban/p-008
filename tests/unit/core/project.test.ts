import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneProject } from '../../../src/core/project'
import { createTempDir } from '../../helpers/tempDir'

vi.mock('../../../src/git/repo', () => ({
  detectDefaultBranchFromRemoteUrl: vi.fn(),
  listRemoteBranchesFromUrl: vi.fn(),
  resolveGitCommonDir: vi.fn()
}))

vi.mock('../../../src/git/exec', () => ({
  git: vi.fn()
}))

vi.mock('../../../src/config/save', () => ({
  saveState: vi.fn()
}))

vi.mock('../../../src/utils/prompt', () => ({
  promptSelect: vi.fn()
}))

import { saveState } from '../../../src/config/save'
import { git } from '../../../src/git/exec'
import { detectDefaultBranchFromRemoteUrl, listRemoteBranchesFromUrl, resolveGitCommonDir } from '../../../src/git/repo'
import { promptSelect } from '../../../src/utils/prompt'

const tempDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('cloneProject', () => {
  beforeEach(() => {
    vi.mocked(listRemoteBranchesFromUrl).mockReset()
    vi.mocked(detectDefaultBranchFromRemoteUrl).mockReset()
    vi.mocked(resolveGitCommonDir).mockReset()
    vi.mocked(git).mockReset()
    vi.mocked(saveState).mockReset()
    vi.mocked(promptSelect).mockReset()
  })

  it('uses main when available in non-interactive mode', async () => {
    const cwd = await createTempDir('clone-project')
    tempDirs.push(cwd)

    vi.mocked(listRemoteBranchesFromUrl).mockResolvedValue(['develop', 'main'])
    vi.mocked(detectDefaultBranchFromRemoteUrl).mockResolvedValue('develop')
    vi.mocked(resolveGitCommonDir).mockResolvedValue('/tmp/repo/.git')
    vi.mocked(git).mockResolvedValue({ stdout: '', stderr: '' })

    const result = await cloneProject({
      repoUrl: 'https://github.com/example/demo.git',
      cwd,
      interactive: false,
      settings: { json: true, interactive: false }
    })

    expect(result).toEqual({
      projectRoot: path.join(cwd, 'demo'),
      workspacePath: path.join(cwd, 'demo', 'main'),
      defaultBranch: 'main'
    })
    expect(git).toHaveBeenNthCalledWith(
      1,
      [
        'clone',
        '--verbose',
        '--progress',
        '-b',
        'main',
        'https://github.com/example/demo.git',
        path.join(cwd, 'demo', 'main')
      ],
      { cwd: path.join(cwd, 'demo'), inheritStdio: true }
    )
    expect(git).toHaveBeenNthCalledWith(2, ['fetch', '--verbose', '--progress', 'origin'], {
      gitDir: '/tmp/repo/.git',
      inheritStdio: true
    })
    expect(saveState).toHaveBeenCalledWith(path.join(cwd, 'demo'), {
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: 'Initial default workspace' }]
    })
  })

  it('prompts for the default branch in interactive mode', async () => {
    const cwd = await createTempDir('clone-project-interactive')
    tempDirs.push(cwd)

    vi.mocked(listRemoteBranchesFromUrl).mockResolvedValue(['develop', 'release'])
    vi.mocked(detectDefaultBranchFromRemoteUrl).mockResolvedValue('develop')
    vi.mocked(resolveGitCommonDir).mockResolvedValue('/tmp/repo/.git')
    vi.mocked(promptSelect).mockResolvedValue('release')
    vi.mocked(git).mockResolvedValue({ stdout: '', stderr: '' })

    const result = await cloneProject({
      repoUrl: 'https://github.com/example/demo.git',
      cwd,
      interactive: true,
      settings: { json: false, interactive: true }
    })

    expect(promptSelect).toHaveBeenCalledWith(
      'Select your default base branch for new workspaces',
      ['develop', 'release'],
      'develop'
    )
    expect(result.defaultBranch).toBe('release')
  })

  it('rejects when the target project folder already exists', async () => {
    const cwd = await createTempDir('clone-project-exists')
    const projectRoot = path.join(cwd, 'demo')
    tempDirs.push(cwd)

    await fs.mkdir(projectRoot)

    await expect(
      cloneProject({
        repoUrl: 'https://github.com/example/demo.git',
        cwd,
        interactive: false,
        settings: { json: true, interactive: false }
      })
    ).rejects.toThrow('target project folder already exists')
  })

  it('rejects when the remote has no branches', async () => {
    const cwd = await createTempDir('clone-project-no-branches')
    tempDirs.push(cwd)

    vi.mocked(listRemoteBranchesFromUrl).mockResolvedValue([])

    await expect(
      cloneProject({
        repoUrl: 'https://github.com/example/demo.git',
        cwd,
        interactive: false,
        settings: { json: true, interactive: false }
      })
    ).rejects.toThrow('no remote branches found')
  })
})
