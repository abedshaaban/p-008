import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectDefaultBranch,
  detectDefaultBranchFromRemoteUrl,
  findWorktreePathForBranch,
  listRemoteBranchesFromUrl,
  remoteBranchExists
} from '../../../src/git/repo'

vi.mock('../../../src/git/exec', () => ({
  git: vi.fn()
}))

import { git } from '../../../src/git/exec'

describe('git repo helpers', () => {
  beforeEach(() => {
    vi.mocked(git).mockReset()
  })

  it('parses remote branch names from ls-remote output', async () => {
    vi.mocked(git).mockResolvedValue({
      stdout: ['abc123\trefs/heads/main', 'def456\trefs/heads/feature/demo', 'def456\trefs/heads/feature/demo'].join(
        '\n'
      ),
      stderr: ''
    })

    await expect(listRemoteBranchesFromUrl('https://example.com/repo.git')).resolves.toEqual(['main', 'feature/demo'])
  })

  it('detects the default branch from HEAD symref output', async () => {
    vi.mocked(git).mockResolvedValue({
      stdout: 'ref: refs/heads/develop\tHEAD\n123456\tHEAD\n',
      stderr: ''
    })

    await expect(detectDefaultBranchFromRemoteUrl('https://example.com/repo.git')).resolves.toBe('develop')
  })

  it('returns null when the default branch lookup fails', async () => {
    vi.mocked(git).mockRejectedValue(new Error('network issue'))

    await expect(detectDefaultBranchFromRemoteUrl('https://example.com/repo.git')).resolves.toBeNull()
  })

  it('falls back to git remote show origin when origin HEAD is unavailable', async () => {
    vi.mocked(git)
      .mockRejectedValueOnce(new Error('missing origin head'))
      .mockResolvedValueOnce({
        stdout: ['* remote origin', '  HEAD branch: release'].join('\n'),
        stderr: ''
      })

    await expect(detectDefaultBranch('/tmp/project/.git')).resolves.toBe('release')
  })

  it('falls back to main when remote show origin is unavailable', async () => {
    vi.mocked(git)
      .mockRejectedValueOnce(new Error('missing origin head'))
      .mockRejectedValueOnce(new Error('remote show failed'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await expect(detectDefaultBranch('/tmp/project/.git')).resolves.toBe('main')
  })

  it('falls back to master when main is unavailable', async () => {
    vi.mocked(git)
      .mockRejectedValueOnce(new Error('missing origin head'))
      .mockRejectedValueOnce(new Error('remote show failed'))
      .mockRejectedValueOnce(new Error('missing main'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await expect(detectDefaultBranch('/tmp/project/.git')).resolves.toBe('master')
  })

  it('finds the worktree path for a checked out branch', async () => {
    vi.mocked(git).mockResolvedValue({
      stdout: [
        'worktree /tmp/project/main',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /tmp/project/feature-demo',
        'HEAD def456',
        'branch refs/heads/feature/demo'
      ].join('\n'),
      stderr: ''
    })

    await expect(findWorktreePathForBranch('/tmp/project/.git', 'feature/demo')).resolves.toBe(
      '/tmp/project/feature-demo'
    )
  })

  it('returns null when the branch is not checked out in any worktree', async () => {
    vi.mocked(git).mockResolvedValue({
      stdout: ['worktree /tmp/project/main', 'HEAD abc123', 'branch refs/heads/main'].join('\n'),
      stderr: ''
    })

    await expect(findWorktreePathForBranch('/tmp/project/.git', 'feature/demo')).resolves.toBeNull()
  })

  it('reports false when a remote branch lookup fails', async () => {
    vi.mocked(git).mockRejectedValue(new Error('missing ref'))

    await expect(remoteBranchExists('/tmp/project/.git', 'feature/demo')).resolves.toBe(false)
  })
})
