# AI native versioning layer that speaks to Git | Git wrapper for AI

`gmd` (gitmedaddy) is a thin wrapper around Git for AI and human workflows that run in parallel.
It does not replace Git. It organizes your local branches as separate folders using Git worktrees.

## Why use gmd

Traditional local Git flow usually centers around one checked-out branch at a time.
That makes parallel work harder when multiple agents (or people) need to work on separate tasks.

With `gmd`, each branch gets its own local workspace folder:

- work on multiple branches side-by-side
- reduce checkout/context switching
- keep one branch per PR goal
- stay fully compatible with standard Git commands

## Quick Start

```bash
# Clone into a gmd workspace layout
gmd clone https://github.com/OWNER/PROJECT_NAME.git

# Create a new branch workspace from your default base branch
gmd new feat/create-footer
```

After clone, the CLI asks:

- What is your main branch to create new branches from? (defaults to `main`)

Your answer is stored in `state/branches.json`, which keeps branch workflow metadata.

To create a new branch workspace, run:

```bash
gmd new <branch-name>
```

This creates the branch from the default base branch configured in `state/branches.json`.  
If you want a different base branch for this run, pass `-f` or `--from`:

```bash
gmd new <branch-name> --from staging
```

## What the workspace looks like

After clone:

```text
PROJECT_NAME/
├── state/
└── main/
    ├── src/
    └── package.json
```

```text
gmd new feat/create-footer
```

After creating a new branch workspace:

```text
PROJECT_NAME/
├── state/
├── main/
│   ├── src/
│   └── package.json
└── feat/create-footer/
    ├── src/
    └── package.json
```

## Demo Workflow

### 1) Clone a repository

```bash
gmd clone https://github.com/OWNER/PROJECT_NAME.git
```

This creates a project folder with:

- a `state/` directory for workflow metadata
- a base branch workspace (commonly `main/`)

### 2) Create a new branch workspace

```bash
gmd new feat/create-footer
```

This creates a new workspace folder for `feat/create-footer` so it can be developed in parallel with other branches.  
You do not need a separate checkout step because each branch already exists as its own folder.

### 3) Choose a custom base branch (optional)

```bash
gmd new feat/create-footer --from staging
```

Use `--from` when you want to branch from something other than the default base branch.

## Command Reference

### clone

```bash
gmd clone <repo-url>
```

Clone a Git repository into a workspace-ready folder structure.

### new

```bash
# create a new workspace branch from the default base branch
gmd new <branch-name>

# create a new workspace branch from a specific base branch
gmd new <branch-name> --from <base-branch>
```

Create a new branch workspace. By default, `--from` uses the configured base branch.

### foundadaddy

```bash
gmd foundadaddy
```

Initialize `gmd` in an existing Git repository and create the first workspace from your selected default base branch.

### cheatondaddy

```bash
gmd cheatondaddy
```

Reverse `gmd` setup for the current project:

- removes all tracked workspace folders
- restores the repository root as the main working tree on your default base branch
- removes `state/` and `.gmd/` metadata so the project behaves like a normal Git repo again

## Under the Hood

`gmd` is built on top of Git worktrees and Git branches.
Your repositories remain normal Git repositories; `gmd` only improves local workspace orchestration for parallel workflows.
