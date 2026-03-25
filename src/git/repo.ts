import fs from 'node:fs/promises'
import path from 'node:path'
import { withLoading } from '../utils/loading'
import { GitCommandError, git } from './exec'
import type { ProjectState } from '../config/types'

export async function resolveGitCommonDir(cwd: string): Promise<string> {
  const { stdout } = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })
  return stdout.trim()
}

export async function resolveGitCommonDirFromState(projectRoot: string, state: ProjectState): Promise<string> {
  for (const w of state.workspaces) {
    const cwd = path.join(projectRoot, w.folderName)
    try {
      await fs.access(path.join(cwd, '.git'))
    } catch {
      continue
    }
    return resolveGitCommonDir(cwd)
  }
  throw new Error('no valid workspace checkout found')
}

export async function listRemoteBranchesFromUrl(repoUrl: string): Promise<Array<string>> {
  const { stdout } = await git(['ls-remote', '--heads', repoUrl])
  const branches: Array<string> = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t')
    const ref = parts[1]
    if (ref?.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length)
      if (name !== 'origin') {
        branches.push(name)
      }
    }
  }
  return Array.from(new Set(branches))
}

export async function detectDefaultBranchFromRemoteUrl(repoUrl: string): Promise<string | null> {
  try {
    const { stdout } = await git(['ls-remote', '--symref', repoUrl, 'HEAD'])
    for (const line of stdout.split('\n')) {
      const match = line.match(/ref:\s+refs\/heads\/(\S+)/)
      if (match?.[1]) {
        return match[1]
      }
    }
  } catch {
    return null
  }
  return null
}

export async function detectDefaultBranch(gitDir: string): Promise<string> {
  // Strategy:
  // 1) Try origin/HEAD symbolic ref (fast path)
  // 2) Fallback to parsing `git remote show origin`
  // 3) Fallback to common names: main, master
  try {
    const { stdout } = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      gitDir
    })
    const fullRef = stdout.trim()
    const parts = fullRef.split('/')
    if (parts.length > 1 && parts[1]) {
      return parts[1]
    }
  } catch {
    // fall through to other strategies
  }

  try {
    const { stdout } = await git(['remote', 'show', 'origin'], { gitDir })
    const lines = stdout.split('\n')
    for (const line of lines) {
      const match = line.trim().match(/^HEAD branch:\s+(.+)$/)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  } catch {
    // fall through
  }

  // Try common defaults explicitly
  for (const candidate of ['main', 'master']) {
    try {
      await git(['rev-parse', `refs/remotes/origin/${candidate}`], { gitDir })
      return candidate
    } catch {
      // keep trying
    }
  }

  throw new Error('remote default branch could not be resolved')
}

export async function listRemoteBranches(gitDir: string): Promise<Array<string>> {
  const { stdout } = await git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], {
    gitDir
  })

  const branches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== 'origin/HEAD')
    .map((line) => line.replace(/^origin\//, ''))
    .filter((name) => name !== 'origin')

  return Array.from(new Set(branches))
}

export async function listLocalBranches(gitDir: string): Promise<Array<string>> {
  const { stdout } = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { gitDir })

  const branches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => name !== 'origin' && !name.startsWith('origin/'))

  return Array.from(new Set(branches))
}

const lastFetchAtByGitDir = new Map<string, number>()

export async function fetchLatest(
  gitDir: string,
  options?: { inheritStdio?: boolean; loadingMessage?: string }
): Promise<void> {
  const inheritStdio = options?.inheritStdio === true
  const loadingMessage = options?.loadingMessage ?? 'Fetching latest branches from origin...'

  // Avoid duplicate fetches within the same CLI command flow.
  const lastAt = lastFetchAtByGitDir.get(gitDir)
  const skipIfFreshWithinMs = inheritStdio ? 0 : 10_000
  if (!inheritStdio && lastAt && Date.now() - lastAt < skipIfFreshWithinMs) {
    return
  }

  const runFetch = () =>
    git(['fetch', 'origin'], {
      gitDir,
      ...(inheritStdio ? { inheritStdio: true } : {})
    })

  await withLoading(loadingMessage, runFetch)
  lastFetchAtByGitDir.set(gitDir, Date.now())
}

export async function ensureBaseBranchExists(gitDir: string, baseBranch: string): Promise<void> {
  try {
    await git(['rev-parse', `refs/remotes/origin/${baseBranch}`], { gitDir })
  } catch {
    throw new Error('base branch not found')
  }
}

export async function remoteBranchExists(gitDir: string, branch: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], { gitDir })
    return true
  } catch {
    return false
  }
}

export async function localBranchExists(gitDir: string, branch: string): Promise<boolean> {
  try {
    await git(['show-ref', '--verify', `refs/heads/${branch}`], { gitDir })
    return true
  } catch {
    return false
  }
}

/** Path of the worktree that has `branch` checked out, or null if none. */
export async function findWorktreePathForBranch(gitDir: string, branch: string): Promise<string | null> {
  const { stdout } = await git(['worktree', 'list', '--porcelain'], { gitDir })
  const lines = stdout.split('\n')
  let currentPath: string | null = null
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length)
    } else if (line.startsWith('branch ') && currentPath) {
      const ref = line.slice('branch '.length).trim()
      const match = ref.match(/^refs\/heads\/(.+)$/)
      if (match?.[1] === branch) {
        return currentPath
      }
    }
  }
  return null
}

function isBranchForceUpdateBlockedByWorktree(error: unknown): boolean {
  if (!(error instanceof GitCommandError)) {
    return false
  }
  const text = `${error.stderr}\n${error.message}`
  return text.includes('used by worktree')
}

/**
 * Align the local branch ref to the remote-tracking ref after fetch.
 * When that branch is checked out in a worktree, `git branch -f` is not allowed; we reset that worktree instead.
 */
export async function syncLocalBranchToRemote(gitDir: string, branch: string): Promise<void> {
  try {
    await git(['branch', '-f', branch, `refs/remotes/origin/${branch}`], {
      gitDir
    })
  } catch (error) {
    if (!isBranchForceUpdateBlockedByWorktree(error)) {
      throw error
    }
    const worktreePath = await findWorktreePathForBranch(gitDir, branch)
    if (!worktreePath) {
      throw error
    }
    await git(['reset', '--hard', `refs/remotes/origin/${branch}`], { cwd: worktreePath })
  }
}

export async function ensureLocalBranch(
  gitDir: string,
  branch: string,
  baseBranch: string,
  createNewBranch: boolean
): Promise<void> {
  // If explicitly creating a new branch, always base it on the configured base branch
  if (createNewBranch) {
    // "Pull" the base branch in the shared repo by force-aligning the local
    // base branch ref to the latest remote ref. This happens after a fetch,
    // so refs/remotes/origin/<baseBranch> is up to date.
    await syncLocalBranchToRemote(gitDir, baseBranch)

    try {
      await git(['show-ref', '--verify', `refs/heads/${branch}`], { gitDir })
      return
    } catch {
      // fall through and create branch
    }

    // When the new branch name differs from the base, Git would otherwise set
    // branch.<name>.merge to the base's remote (e.g. track origin/main), so the
    // UI shows "up to date with origin/main" instead of prompting to publish the new branch.
    if (branch === baseBranch) {
      await git(['branch', branch, `refs/remotes/origin/${baseBranch}`], { gitDir })
    } else {
      await git(['branch', '--no-track', branch, `refs/remotes/origin/${baseBranch}`], { gitDir })
    }
    return
  }

  // Try to use an existing remote branch if it exists
  try {
    await git(['rev-parse', `refs/remotes/origin/${branch}`], { gitDir })

    // "Pull" the branch we are checking out from by force-aligning the local
    // branch ref to the latest remote ref. This keeps local refs in sync
    // with origin for that branch.
    await syncLocalBranchToRemote(gitDir, branch)
    return
  } catch {
    // Remote branch doesn't exist - fall back to creating from base branch
  }

  // Fallback behavior: create from the base branch (previous default behavior)
  try {
    await git(['show-ref', '--verify', `refs/heads/${branch}`], { gitDir })
    return
  } catch {
    // fall through and create branch
  }

  if (branch === baseBranch) {
    await git(['branch', branch, `refs/remotes/origin/${baseBranch}`], { gitDir })
  } else {
    await git(['branch', '--no-track', branch, `refs/remotes/origin/${baseBranch}`], { gitDir })
  }
}

export async function createWorktree(gitDir: string, worktreePath: string, branch: string): Promise<void> {
  await git(['worktree', 'add', worktreePath, branch], { gitDir })
}

/** Git lists the primary (non-removable) worktree first in porcelain output. */
export async function getMainWorktreePath(gitDir: string): Promise<string | null> {
  const { stdout } = await git(['worktree', 'list', '--porcelain'], { gitDir })
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length)
    }
  }
  return null
}

export async function isPrimaryWorktree(gitDir: string, worktreePath: string): Promise<boolean> {
  const main = await getMainWorktreePath(gitDir)
  if (!main) {
    return false
  }
  return path.resolve(worktreePath) === path.resolve(main)
}

export async function removeWorktree(gitDir: string, worktreePath: string): Promise<void> {
  await git(['worktree', 'remove', worktreePath], { gitDir })
}
