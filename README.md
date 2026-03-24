# gitmedaddy (`gmd`)

![Gmd (Git Me Daddy): thin Git wrapper that manages worktrees better—everything you can do with Gmd you can do with Git](assets/banner.png)

`gitmedaddy` (short alias: `gmd`) is a Git worktree-based CLI for running branch workflows in parallel.
It keeps Git as the source of truth while organizing each branch as its own local workspace folder.

## Why use it

Traditional local Git flow usually centers on one checked-out branch at a time.
`gmd` removes that bottleneck by keeping multiple branches visible side-by-side.

- Work on several branches at once
- Reduce checkout/context switching
- Keep one branch workspace per task/goal
- Stay fully compatible with normal Git commands

## Installation

### From the registry (global)

**pnpm**

```bash
pnpm add -g gitmedaddy
```

**bun**

```bash
bun add -g gitmedaddy
```

## Core Concepts

- The first workspace is a normal Git clone (or your existing repo root); extra branches are **Git worktrees** that share the same object database.
- Workspace metadata (default base branch, visible workspaces, goals) lives in **`state/branches.json`** at the project root.
- Project metadata and workspace state live under **`state/`** (`config.json` and `branches.json`). The CLI discovers a gmd project by walking up until it finds that folder.

Example layout:

```text
my-project/
├── state/
│   ├── config.json
│   └── branches.json
├── main/
└── feat-create-footer/
```

## Quick Start

### Option A: Start from a remote repository

```bash
gmd clone https://github.com/OWNER/PROJECT_NAME.git
```

During setup, you will choose a default base branch (for example `main`).

### Option B: Initialize inside an existing local Git repo

```bash
cd your-existing-repo
gmd foundadaddy
```

This sets up `state/config.json`, `state/branches.json`, and your first displayed workspace (or reuses the repo root when it already matches your default base branch).

### Create a new branch workspace

```bash
gmd new feat/create-footer
```

`gmd new` prompts for:

- Workspace folder name (defaults to a branch-based slug)
- Goal (optional; stored in workspace metadata)

Use a custom base branch when needed:

```bash
gmd new feat/create-footer --from staging
```

## Typical Workflow

```bash
# 1) Create/show branch workspaces
gmd new feat/login
gmd show bugfix/session-timeout

# 2) Work inside each workspace folder with normal git commands
cd feat-login
git status
git add .
git commit -m "Implement login form"

# 3) Pull latest updates
gmd pull --all

# 4) Merge base updates into your current workspace
gmd merge

# 5) Create PR from current workspace branch
gmd pr --draft
```

## Command Reference

### `clone`

```bash
gmd clone <repo-url>
```

Clone a repository into a `gmd`-managed project: a default branch folder (full clone) plus `state/config.json` and `state/branches.json`.

### `foundadaddy`

```bash
gmd foundadaddy
```

Initialize `gmd` in an existing Git repository.

### `new` (`n`)

```bash
gmd new <branch-name>
gmd new <branch-name> --from <base-branch>
```

Create and display a new workspace branch (or attach to existing remote branch if it already exists).

### `show` (`s`)

```bash
gmd show <branch-name>
```

Display an existing branch (local or remote) as a workspace folder.

### `hide` (`h`)

```bash
gmd hide <branch-name>
```

Hide a displayed workspace by removing its local worktree folder.

### `clean` (`c`)

```bash
gmd clean
gmd clean --from <branch-name>
```

Hide all displayed workspaces except one branch to keep visible.

### `pull`

```bash
gmd pull
gmd pull --all
```

Pull latest changes for the current displayed workspace, or all displayed workspaces.

### `merge`

```bash
gmd merge
gmd merge --from <source-branch> --to <target-branch>
```

Merge source branch changes into a target displayed workspace branch.

### `setgoal`

```bash
gmd setgoal "<goal text>"
gmd setgoal "<goal text>" <branch-name>
```

Set/update goal text for a displayed workspace.

### `showgoal`

```bash
gmd showgoal
gmd showgoal <branch-name>
```

Show saved goal text for a displayed workspace.

### `pr`

```bash
gmd pr
gmd pr --base <branch-name> --title "<title>"
gmd pr --draft
```

Create a GitHub pull request for the current workspace branch.
This command pushes with upstream (`git push -u origin <branch>`) before opening the PR.

## Notes and Requirements

- Requires Git installed and available in `PATH`.
- `gmd pr` requires GitHub CLI (`gh`) installed and authenticated.
- Run commands from inside a `gmd` project/workspace for non-`clone` operations.
- Command output is JSON for script-friendly automation.

## Under the Hood

`gmd` is built on Git branches + Git worktrees.
Your repositories remain standard Git repositories; `gmd` adds local orchestration for parallel branch workflows.
