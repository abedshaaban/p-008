#!/usr/bin/env node

import { Command } from 'commander'
import { registerCloneCommand } from '../commands/clone'
import { registerHideCommand } from '../commands/hide'
import { registerNewCommand } from '../commands/new'
import { registerShowCommand } from '../commands/show'

export function createCli() {
  const program = new Command()

  program.name('gitmedaddy').description('Thin Git integration layer').version('0.0.1')

  registerCloneCommand(program)
  registerNewCommand(program)
  registerShowCommand(program)
  registerHideCommand(program)

  return program
}

if (require.main === module) {
  const program = createCli()
  program.parse(process.argv)
}
