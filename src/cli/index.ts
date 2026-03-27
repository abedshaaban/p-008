import { Command } from 'commander'
import { registerCleanCommand } from '../commands/clean'
import { registerCheatOnDaddyCommand } from '../commands/cheatondaddy'
import { registerCloneCommand } from '../commands/clone'
import { registerFoundADaddyCommand } from '../commands/foundadaddy'
import { registerHideCommand } from '../commands/hide'
import { registerMergeCommand } from '../commands/merge'
import { registerNewCommand } from '../commands/new'
import { registerPrCommand } from '../commands/pr'
import { registerPullCommand } from '../commands/pull'
import { registerSetGoalCommand } from '../commands/setgoal'
import { registerShowCommand } from '../commands/show'
import { registerShowGoalCommand } from '../commands/showgoal'
import { registerUpdateCommand } from '../commands/update'

export function createCli() {
  const program = new Command()

  program.name('gitmedaddy').description('Thin Git integration layer').version('0.0.17', '-v, --version')
  program.option('--json', 'Force JSON output for this command')
  program.option('--no-json', 'Force text output for this command')
  program.option('--interactive', 'Force interactive prompts for this command')
  program.option('--no-interactive', 'Disable interactive prompts for this command')

  registerCloneCommand(program)
  registerFoundADaddyCommand(program)
  registerCheatOnDaddyCommand(program)
  registerNewCommand(program)
  registerShowCommand(program)
  registerSetGoalCommand(program)
  registerShowGoalCommand(program)
  registerHideCommand(program)
  registerCleanCommand(program)
  registerPullCommand(program)
  registerMergeCommand(program)
  registerPrCommand(program)
  registerUpdateCommand(program)

  return program
}

if (require.main === module) {
  const program = createCli()
  program.parse(process.argv)
}
