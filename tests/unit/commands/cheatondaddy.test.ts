import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerCheatOnDaddyCommand } from '../../../src/commands/cheatondaddy'
import { executeCommand } from '../../../src/commands/_shared'
import { cheatOnDaddy } from '../../../src/core/cheatondaddy'

vi.mock('../../../src/commands/_shared', () => ({
  executeCommand: vi.fn()
}))

vi.mock('../../../src/core/cheatondaddy', () => ({
  cheatOnDaddy: vi.fn()
}))

describe('cheatondaddy command', () => {
  beforeEach(() => {
    vi.mocked(executeCommand).mockReset()
    vi.mocked(cheatOnDaddy).mockReset()
    vi.mocked(executeCommand).mockImplementation(async (_command, run) => {
      await run({ json: true, interactive: false })
    })
  })

  it('routes through executeCommand and forwards cwd', async () => {
    vi.mocked(cheatOnDaddy).mockResolvedValue({ restored: true } as never)
    const program = new Command()
    registerCheatOnDaddyCommand(program)

    await program.parseAsync(['node', 'test', 'cheatondaddy'])

    expect(executeCommand).toHaveBeenCalledTimes(1)
    expect(cheatOnDaddy).toHaveBeenCalledWith({ cwd: process.cwd() })
  })
})
