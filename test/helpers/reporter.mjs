import { spec } from 'node:test/reporters'
import { Transform } from 'node:stream'

const ICONS = {
  pass: '\x1b[32m✓\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  skip: '\x1b[33m○\x1b[0m',
  todo: '\x1b[36m◇\x1b[0m',
  suite: '\x1b[1m\x1b[36m▶\x1b[0m',
}

const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

export default async function* reporter(source) {
  const startTime = Date.now()
  let passCount = 0
  let failCount = 0
  let skipCount = 0
  let suiteName = ''

  for await (const event of source) {
    if (event.type === 'test:start' && event.data.nesting === 0) {
      suiteName = event.data.name
      yield `\n${ICONS.suite} ${COLORS.bold(suiteName)}\n`
    }

    if (event.type === 'test:pass') {
      passCount++
      const ms = event.data.details?.duration_ms ?? 0
      const name = event.data.name
      const time = ms > 100 ? COLORS.yellow(` ${ms.toFixed(1)}ms`) : COLORS.dim(` ${ms.toFixed(1)}ms`)
      yield `  ${ICONS.pass} ${name}${time}\n`
    }

    if (event.type === 'test:fail') {
      failCount++
      const ms = event.data.details?.duration_ms ?? 0
      const name = event.data.name
      const time = COLORS.yellow(` ${ms.toFixed(1)}ms`)
      yield `  ${ICONS.fail} ${COLORS.red(name)}${time}\n`
      if (event.data.details?.error) {
        const err = event.data.details.error
        const msg = err.message || String(err)
        yield `    ${COLORS.dim('→')} ${COLORS.red(msg)}\n`
      }
    }

    if (event.type === 'test:skip') {
      skipCount++
      yield `  ${ICONS.skip} ${COLORS.yellow(event.data.name)}\n`
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  const total = passCount + failCount + skipCount

  yield '\n'
  yield COLORS.dim('─'.repeat(50)) + '\n'

  const parts = []
  if (passCount) parts.push(COLORS.green(`${passCount} passed`))
  if (failCount) parts.push(COLORS.red(`${failCount} failed`))
  if (skipCount) parts.push(COLORS.yellow(`${skipCount} skipped`))

  yield `  ${COLORS.bold('Results:')} ${parts.join(', ')}  ${COLORS.dim(`(${total} tests in ${elapsed}s)`)}\n`

  if (failCount === 0) {
    yield `\n  ${COLORS.green(COLORS.bold('All tests passed!'))}\n`
  }

  yield '\n'
}
