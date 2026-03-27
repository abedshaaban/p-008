import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/commands/_shared', () => ({
  executeCommand: vi.fn()
}))

vi.mock('../../../src/cli/output', () => ({
  printInfo: vi.fn()
}))

vi.mock('../../../src/config/load', () => ({
  loadState: vi.fn()
}))

vi.mock('../../../src/core/workspace', () => ({
  cleanWorkspaces: vi.fn(),
  hideWorkspace: vi.fn(),
  showWorkspace: vi.fn()
}))

vi.mock('../../../src/git/repo', () => ({
  fetchLatest: vi.fn(),
  listLocalBranches: vi.fn(),
  listRemoteBranches: vi.fn(),
  resolveGitCommonDirFromState: vi.fn()
}))

vi.mock('../../../src/utils/findProjectRoot', () => ({
  findProjectRoot: vi.fn()
}))

vi.mock('../../../src/utils/prompt', () => ({
  promptInput: vi.fn(),
  promptSelect: vi.fn()
}))

import { printInfo } from '../../../src/cli/output'
import { registerCleanCommand } from '../../../src/commands/clean'
import { registerHideCommand } from '../../../src/commands/hide'
import { registerShowCommand } from '../../../src/commands/show'
import { executeCommand } from '../../../src/commands/_shared'
import { loadState } from '../../../src/config/load'
import { cleanWorkspaces, hideWorkspace, showWorkspace } from '../../../src/core/workspace'
import { fetchLatest, listLocalBranches, listRemoteBranches, resolveGitCommonDirFromState } from '../../../src/git/repo'
import { findProjectRoot } from '../../../src/utils/findProjectRoot'
import { promptInput, promptSelect } from '../../../src/utils/prompt'

describe('show, hide, and clean command actions', () => {
  let behavior = { json: true, interactive: false }

  beforeEach(() => {
    behavior = { json: true, interactive: false }
    vi.mocked(executeCommand).mockReset()
    vi.mocked(printInfo).mockReset()
    vi.mocked(loadState).mockReset()
    vi.mocked(showWorkspace).mockReset()
    vi.mocked(hideWorkspace).mockReset()
    vi.mocked(cleanWorkspaces).mockReset()
    vi.mocked(fetchLatest).mockReset()
    vi.mocked(listLocalBranches).mockReset()
    vi.mocked(listRemoteBranches).mockReset()
    vi.mocked(resolveGitCommonDirFromState).mockReset()
    vi.mocked(findProjectRoot).mockReset()
    vi.mocked(promptInput).mockReset()
    vi.mocked(promptSelect).mockReset()

    vi.mocked(executeCommand).mockImplementation(async (_command, run) => run(behavior))
  })

  it('show uses the explicit branch name and prints remote usage info', async () => {
    vi.mocked(showWorkspace).mockResolvedValue({ usedRemoteBranch: true } as never)
    const program = new Command()
    registerShowCommand(program)

    await program.parseAsync(['node', 'test', 'show', 'feature/demo'])

    expect(showWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      folderName: 'feature-demo',
      cwd: process.cwd()
    })
    expect(printInfo).toHaveBeenCalledWith('Using remote branch "feature/demo" and displaying it locally.', behavior)
  })

  it('show supports interactive branch selection and custom folder names', async () => {
    behavior = { json: false, interactive: true }
    vi.mocked(findProjectRoot).mockReturnValue('/tmp/project')
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: true },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
    vi.mocked(resolveGitCommonDirFromState).mockResolvedValue('/tmp/project/.git')
    vi.mocked(listRemoteBranches).mockResolvedValue(['feature/demo', 'main'])
    vi.mocked(listLocalBranches).mockResolvedValue(['local-only'])
    vi.mocked(promptSelect).mockResolvedValue('feature/demo')
    vi.mocked(promptInput).mockResolvedValue('custom-folder')
    vi.mocked(showWorkspace).mockResolvedValue({ usedRemoteBranch: false } as never)
    const program = new Command()
    registerShowCommand(program)

    await program.parseAsync(['node', 'test', 'show'])

    expect(fetchLatest).toHaveBeenCalledWith('/tmp/project/.git')
    expect(promptSelect).toHaveBeenCalledWith('Select the branch to display', ['feature/demo', 'local-only'], 'main')
    expect(promptInput).toHaveBeenCalledWith('Workspace folder name', 'feature-demo')
    expect(showWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      folderName: 'custom-folder',
      cwd: process.cwd()
    })
  })

  it('hide forwards an explicit branch name directly', async () => {
    vi.mocked(hideWorkspace).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerHideCommand(program)

    await program.parseAsync(['node', 'test', 'hide', 'feature/demo'])

    expect(hideWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      cwd: process.cwd()
    })
  })

  it('hide supports interactive branch selection from visible workspaces', async () => {
    behavior = { json: false, interactive: true }
    vi.mocked(findProjectRoot).mockReturnValue('/tmp/project')
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: true },
      workspaces: [
        { branch: 'main', folderName: 'main', goal: '' },
        { branch: 'feature/demo', folderName: 'feature-demo', goal: '' }
      ]
    })
    vi.mocked(promptSelect).mockResolvedValue('feature-demo feature/demo')
    vi.mocked(hideWorkspace).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerHideCommand(program)

    await program.parseAsync(['node', 'test', 'hide'])

    expect(promptSelect).toHaveBeenCalledWith(
      'Select the branch to hide',
      ['main main', 'feature-demo feature/demo'],
      'main main'
    )
    expect(hideWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      cwd: process.cwd()
    })
  })

  it('clean forwards the explicit keep branch', async () => {
    vi.mocked(cleanWorkspaces).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerCleanCommand(program)

    await program.parseAsync(['node', 'test', 'clean', '--from', 'develop'])

    expect(cleanWorkspaces).toHaveBeenCalledWith({
      cwd: process.cwd(),
      keepBranch: 'develop'
    })
  })

  it('clean supports interactive branch selection from the state', async () => {
    behavior = { json: false, interactive: true }
    vi.mocked(findProjectRoot).mockReturnValue('/tmp/project')
    vi.mocked(loadState).mockResolvedValue({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: true },
      workspaces: [
        { branch: 'main', folderName: 'main', goal: '' },
        { branch: 'feature/demo', folderName: 'feature-demo', goal: '' }
      ]
    })
    vi.mocked(promptSelect).mockResolvedValue('feature/demo')
    vi.mocked(cleanWorkspaces).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerCleanCommand(program)

    await program.parseAsync(['node', 'test', 'clean'])

    expect(promptSelect).toHaveBeenCalledWith(
      'Select the branch to keep displayed',
      expect.arrayContaining(['main', 'feature/demo']),
      'main'
    )
    expect(cleanWorkspaces).toHaveBeenCalledWith({
      cwd: process.cwd(),
      keepBranch: 'feature/demo'
    })
  })
})
