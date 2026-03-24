import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export async function promptInput(question: string, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({ input, output })
  const suffix = defaultValue ? ` (${defaultValue})` : ''
  const answer = await rl.question(`${question}${suffix}: `)
  rl.close()

  const trimmed = answer.trim()
  if (!trimmed && defaultValue) return defaultValue
  return trimmed
}

export async function promptSelect(question: string, options: string[], defaultValue: string): Promise<string> {
  if (options.length === 0) {
    throw new Error('no options available for selection')
  }

  // eslint-disable-next-line no-console
  console.log(question)
  options.forEach((option, index) => {
    const marker = option === defaultValue ? ' (default)' : ''
    // eslint-disable-next-line no-console
    console.log(`  ${index + 1}) ${option}${marker}`)
  })

  const rawSelection = await promptInput('Select option number', '')
  if (!rawSelection) {
    return options.includes(defaultValue) ? defaultValue : options[0]!
  }

  const selectedIndex = Number.parseInt(rawSelection, 10)
  if (!Number.isNaN(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.length) {
    return options[selectedIndex - 1]!
  }

  if (options.includes(rawSelection)) {
    return rawSelection
  }

  throw new Error('invalid selection')
}
