import { Command } from 'commander'
import { afterEach, describe, expect, it } from 'vitest'
import { createCli } from '../../../src/cli/index'
import { resolveCliBehavior, resolveFallbackCliBehavior } from '../../../src/cli/behavior'
import { getGlobalCliOptions } from '../../../src/cli/options'
import { setWritableValue } from '../../helpers/tty'

function createProgramWithGlobalOptions(): { program: Command; child: Command } {
  const program = new Command()
  program.option('--json', 'Force JSON output for this command')
  program.option('--no-json', 'Force text output for this command')
  program.option('--interactive', 'Force interactive prompts for this command')
  program.option('--no-interactive', 'Disable interactive prompts for this command')

  const child = program.command('demo')
  return { program, child }
}

describe('global CLI options', () => {
  let restoreStdin: (() => void) | undefined
  let restoreStdout: (() => void) | undefined

  afterEach(() => {
    restoreStdin?.()
    restoreStdout?.()
    restoreStdin = undefined
    restoreStdout = undefined
  })

  it('defines the expected global json and interactive flags on the root CLI', () => {
    const program = createCli()
    const longFlags = program.options.map((option) => option.long)

    expect(longFlags).toEqual(expect.arrayContaining(['--json', '--no-json', '--interactive', '--no-interactive']))
  })

  it('parses --json and --interactive as true global overrides', () => {
    const { program, child } = createProgramWithGlobalOptions()

    program.parse(['node', 'test', '--json', '--interactive', 'demo'])

    expect(getGlobalCliOptions(child)).toEqual({
      json: true,
      interactive: true
    })
  })

  it('parses --no-json and --no-interactive as false global overrides', () => {
    const { program, child } = createProgramWithGlobalOptions()

    program.parse(['node', 'test', '--no-json', '--no-interactive', 'demo'])

    expect(getGlobalCliOptions(child)).toEqual({
      json: false,
      interactive: false
    })
  })

  it('uses negated overrides when resolving fallback cli behavior', () => {
    restoreStdin = setWritableValue(process.stdin, 'isTTY', true)
    restoreStdout = setWritableValue(process.stdout, 'isTTY', true)

    expect(resolveFallbackCliBehavior({ json: false, interactive: false })).toEqual({
      json: false,
      interactive: false
    })
  })

  it('keeps interactive disabled even when --interactive is set but tty is unavailable', async () => {
    restoreStdin = setWritableValue(process.stdin, 'isTTY', false)
    restoreStdout = setWritableValue(process.stdout, 'isTTY', false)

    await expect(resolveCliBehavior('/tmp/outside-project', { json: true, interactive: true })).resolves.toEqual({
      json: true,
      interactive: false
    })
  })
})
