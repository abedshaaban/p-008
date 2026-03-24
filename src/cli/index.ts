#!/usr/bin/env node

import { Command } from 'commander'
import { registerCleanCommand } from '../commands/clean'
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

  program.name('gitmedaddy').description('Thin Git integration layer').version('0.0.7')

  registerCloneCommand(program)
  registerFoundADaddyCommand(program)
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
