import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGlobalCliOptions } from '../../../src/cli/options'
import { registerFoundADaddyCommand } from '../../../src/commands/foundadaddy'
import { registerNewCommand } from '../../../src/commands/new'
import { registerSetGoalCommand } from '../../../src/commands/setgoal'
import { registerShowGoalCommand } from '../../../src/commands/showgoal'
import { registerUpdateCommand } from '../../../src/commands/update'
import { executeCommand } from '../../../src/commands/_shared'
import { foundADaddy } from '../../../src/core/foundadaddy'
import {
  createNewWorkspace,
  setWorkspaceGoal,
  showWorkspaceGoal,
  updateDefaultBaseBranch
} from '../../../src/core/workspace'
import { promptInput } from '../../../src/utils/prompt'

vi.mock('../../../src/commands/_shared', () => ({
  executeCommand: vi.fn()
}))

vi.mock('../../../src/core/foundadaddy', () => ({
  foundADaddy: vi.fn()
}))

vi.mock('../../../src/core/workspace', () => ({
  createNewWorkspace: vi.fn(),
  setWorkspaceGoal: vi.fn(),
  showWorkspaceGoal: vi.fn(),
  updateDefaultBaseBranch: vi.fn()
}))

vi.mock('../../../src/utils/prompt', () => ({
  promptInput: vi.fn()
}))

vi.mock('../../../src/cli/options', () => ({
  getGlobalCliOptions: vi.fn()
}))

describe('basic command actions', () => {
  let behavior = { json: true, interactive: false }

  beforeEach(() => {
    behavior = { json: true, interactive: false }
    vi.mocked(executeCommand).mockReset()
    vi.mocked(foundADaddy).mockReset()
    vi.mocked(createNewWorkspace).mockReset()
    vi.mocked(setWorkspaceGoal).mockReset()
    vi.mocked(showWorkspaceGoal).mockReset()
    vi.mocked(updateDefaultBaseBranch).mockReset()
    vi.mocked(promptInput).mockReset()
    vi.mocked(getGlobalCliOptions).mockReset()

    vi.mocked(executeCommand).mockImplementation(async (_command, run) => {
      await run(behavior)
    })
    vi.mocked(getGlobalCliOptions).mockReturnValue({})
  })

  it('foundadaddy passes cwd and behavior settings through executeCommand', async () => {
    vi.mocked(foundADaddy).mockResolvedValue({
      projectRoot: '/tmp/project',
      workspacePath: '/tmp/project/main',
      defaultBaseBranch: 'main'
    })
    const program = new Command()
    registerFoundADaddyCommand(program)

    await program.parseAsync(['node', 'test', 'foundadaddy'])

    expect(foundADaddy).toHaveBeenCalledWith({
      cwd: process.cwd(),
      interactive: false,
      settings: { json: true, interactive: false }
    })
  })

  it('new uses the slugged branch name when interactive mode is disabled', async () => {
    vi.mocked(createNewWorkspace).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerNewCommand(program)

    await program.parseAsync(['node', 'test', 'new', 'feature/demo', '--from', 'develop'])

    expect(createNewWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      baseBranchOverride: 'develop',
      folderName: 'feature-demo',
      goal: '',
      cwd: process.cwd()
    })
  })

  it('new prompts for folder name and goal in interactive mode', async () => {
    behavior = { json: false, interactive: true }
    vi.mocked(promptInput).mockResolvedValueOnce('custom-folder').mockResolvedValueOnce('ship feature')
    vi.mocked(createNewWorkspace).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerNewCommand(program)

    await program.parseAsync(['node', 'test', 'new', 'feature/demo'])

    expect(promptInput).toHaveBeenNthCalledWith(1, 'Workspace folder name', 'feature-demo')
    expect(promptInput).toHaveBeenNthCalledWith(2, 'Goal (optional)', '')
    expect(createNewWorkspace).toHaveBeenCalledWith({
      branchName: 'feature/demo',
      baseBranchOverride: undefined,
      folderName: 'custom-folder',
      goal: 'ship feature',
      cwd: process.cwd()
    })
  })

  it('setgoal forwards the goal and optional branch name', async () => {
    vi.mocked(setWorkspaceGoal).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerSetGoalCommand(program)

    await program.parseAsync(['node', 'test', 'setgoal', 'Ship it', 'feature/demo'])

    expect(setWorkspaceGoal).toHaveBeenCalledWith({
      cwd: process.cwd(),
      goal: 'Ship it',
      branchName: 'feature/demo'
    })
  })

  it('showgoal forwards the optional branch name', async () => {
    vi.mocked(showWorkspaceGoal).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerShowGoalCommand(program)

    await program.parseAsync(['node', 'test', 'showgoal', 'feature/demo'])

    expect(showWorkspaceGoal).toHaveBeenCalledWith({
      cwd: process.cwd(),
      branchName: 'feature/demo'
    })
  })

  it('update forwards the base branch override and global setting overrides', async () => {
    behavior = { json: false, interactive: true }
    vi.mocked(getGlobalCliOptions).mockReturnValue({ json: false, interactive: true })
    vi.mocked(updateDefaultBaseBranch).mockResolvedValue({ ok: true } as never)
    const program = new Command()
    registerUpdateCommand(program)

    await program.parseAsync(['node', 'test', 'update', '--base', 'develop'])

    expect(updateDefaultBaseBranch).toHaveBeenCalledWith({
      cwd: process.cwd(),
      interactive: true,
      baseBranchOverride: 'develop',
      settingsOverrides: { json: false, interactive: true }
    })
  })
})
