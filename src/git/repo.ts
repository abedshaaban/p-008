import path from "node:path";
import { git, GitCommandError } from "./exec";

export async function initBareRepo(projectRoot: string, repoUrl: string) {
  const gitDir = path.join(projectRoot, ".gmd", "repo.git");

  await git(["clone", "--bare", repoUrl, gitDir], { cwd: projectRoot });

  await git(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], { gitDir });

  await git(["fetch", "origin"], { gitDir });

  return gitDir;
}

export async function detectDefaultBranch(gitDir: string): Promise<string> {
  // Strategy:
  // 1) Try origin/HEAD symbolic ref (fast path)
  // 2) Fallback to parsing `git remote show origin`
  // 3) Fallback to common names: main, master
  try {
    const { stdout } = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      gitDir,
    });
    const fullRef = stdout.trim();
    const parts = fullRef.split("/");
    if (parts.length > 1 && parts[1]) {
      return parts[1];
    }
  } catch {
    // fall through to other strategies
  }

  try {
    const { stdout } = await git(["remote", "show", "origin"], { gitDir });
    const lines = stdout.split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^HEAD branch:\s+(.+)$/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // fall through
  }

  // Try common defaults explicitly
  for (const candidate of ["main", "master"]) {
    try {
      await git(["rev-parse", `refs/remotes/origin/${candidate}`], { gitDir });
      return candidate;
    } catch {
      // keep trying
    }
  }

  throw new Error("remote default branch could not be resolved");
}

export async function listRemoteBranches(gitDir: string): Promise<string[]> {
  const { stdout } = await git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], {
    gitDir,
  });

  const branches = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "origin/HEAD")
    .map((line) => line.replace(/^origin\//, ""));

  return Array.from(new Set(branches));
}

export async function fetchLatest(gitDir: string): Promise<void> {
  await git(["fetch", "origin"], { gitDir });
}

export async function ensureBaseBranchExists(gitDir: string, baseBranch: string): Promise<void> {
  try {
    await git(["rev-parse", `refs/remotes/origin/${baseBranch}`], { gitDir });
  } catch {
    throw new Error("base branch not found");
  }
}

export async function remoteBranchExists(gitDir: string, branch: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", `refs/remotes/origin/${branch}`], { gitDir });
    return true;
  } catch {
    return false;
  }
}

export async function localBranchExists(gitDir: string, branch: string): Promise<boolean> {
  try {
    await git(["show-ref", "--verify", `refs/heads/${branch}`], { gitDir });
    return true;
  } catch {
    return false;
  }
}

export async function syncLocalBranchToRemote(gitDir: string, branch: string): Promise<void> {
  await git(["branch", "-f", branch, `refs/remotes/origin/${branch}`], {
    gitDir,
  });
}

export async function ensureLocalBranch(
  gitDir: string,
  branch: string,
  baseBranch: string,
  createNewBranch: boolean,
): Promise<void> {
  // If explicitly creating a new branch, always base it on the configured base branch
  if (createNewBranch) {
    // "Pull" the base branch in the bare repo by force-aligning the local
    // base branch ref to the latest remote ref. This happens after a fetch,
    // so refs/remotes/origin/<baseBranch> is up to date.
    await git(["branch", "-f", baseBranch, `refs/remotes/origin/${baseBranch}`], {
      gitDir,
    });

    try {
      await git(["show-ref", "--verify", `refs/heads/${branch}`], { gitDir });
      return;
    } catch {
      // fall through and create branch
    }

    await git(["branch", branch, `refs/remotes/origin/${baseBranch}`], {
      gitDir,
    });
    return;
  }

  // Try to use an existing remote branch if it exists
  try {
    await git(["rev-parse", `refs/remotes/origin/${branch}`], { gitDir });

    // "Pull" the branch we are checking out from by force-aligning the local
    // branch ref to the latest remote ref. This keeps the bare repo in sync
    // with origin for that branch.
    await git(["branch", "-f", branch, `refs/remotes/origin/${branch}`], {
      gitDir,
    });
    return;
  } catch {
    // Remote branch doesn't exist - fall back to creating from base branch
  }

  // Fallback behavior: create from the base branch (previous default behavior)
  try {
    await git(["show-ref", "--verify", `refs/heads/${branch}`], { gitDir });
    return;
  } catch {
    // fall through and create branch
  }

  await git(["branch", branch, `refs/remotes/origin/${baseBranch}`], {
    gitDir,
  });
}

export async function createWorktree(
  gitDir: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await git(["worktree", "add", worktreePath, branch], { gitDir });
}

export async function removeWorktree(gitDir: string, worktreePath: string): Promise<void> {
  await git(["worktree", "remove", worktreePath], { gitDir });
}
