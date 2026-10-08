import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'connection-badge'
const START = { cwd: '/home/deploy/app', surface: 'terminal', isInteractive: true } as const
const SURFACES = ['terminal', 'desktop'] as const

type Machine = { name: string; hasProc?: boolean; osrelease?: string }

// Everything beneath the plugin: the machine (its /proc files on Linux, the
// `hostname` command elsewhere), the session, and the engine's footer, which
// draws the mode labels it is handed. Answers which commands the plugin ran.
function machine(on: On, { name, hasProc = true, osrelease = '6.8.0-45-generic' }: Machine) {
  const ran: string[][] = []

  on('fs.read', ($, e) => {
    // The engine resolves the path first: run on Windows, /proc/... is C:\proc\...
    const path = e.path.replaceAll('\\', '/')
    if (hasProc && path.endsWith('/proc/sys/kernel/hostname')) return { value: `${name}\n` }
    if (hasProc && path.endsWith('/proc/sys/kernel/osrelease')) return { value: `${osrelease}\n` }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('process.run', ($, e) => {
    ran.push([...e.argv])

    return {
      value: {
        exitCode: 0,
        stdout: `${name}\n`,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: START.cwd }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>{e.props.modes.join(' & ')}</Text>
  })

  return ran
}

async function footer($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'SessionMode',
    props: { modes: ['focus'] },
  })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()

  return text
}

test('an SSH session shows the user, server and its address', async ($, on) => {
  mock.env(on, {
    SSH_CONNECTION: '203.0.113.9 51234 10.0.0.5 22',
    SSH_CLIENT: '203.0.113.9 51234 22',
    USER: 'deploy',
  })
  const ran = machine(on, { name: 'web-01' })
  await $.session.start(START)

  for (const surface of SURFACES) {
    expect(await footer($, surface)).toBe('focus & ssh: deploy@web-01 (10.0.0.5)')
  }
  expect(ran).toEqual([])
})

test('a local Windows session shows the computer name', async ($, on) => {
  mock.env(on, { COMPUTERNAME: 'DESKTOP-ABC123', USERNAME: 'alex' })
  machine(on, { name: 'not-read-on-windows', hasProc: false })
  await $.session.start(START)

  for (const surface of SURFACES) {
    expect(await footer($, surface)).toBe('focus & local: DESKTOP-ABC123')
  }
})

test('without /proc the hostname command names the machine', async ($, on) => {
  mock.env(on, { USER: 'alex' })
  const ran = machine(on, { name: 'alex-macbook.local', hasProc: false })
  await $.session.start(START)

  expect(await footer($, 'desktop')).toBe('focus & local: alex-macbook.local')
  expect(ran).toEqual([['hostname']])
})

test('a server session the desktop app started counts as SSH without the SSH variables', async ($, on) => {
  mock.env(on, {
    CLAUDE_CODE_EXECPATH: '/home/deploy/.claude/remote/ccd-cli/2.1.293/claude',
    USER: 'deploy',
  })
  machine(on, { name: 'web-01' })
  await $.session.start(START)

  expect(await footer($, 'desktop')).toBe('focus & ssh: deploy@web-01')
})

test('a WSL session is never taken for SSH', async ($, on) => {
  mock.env(on, {
    CLAUDE_CODE_EXECPATH: '/home/alex/.claude/remote/ccd-cli/2.1.293/claude',
    USER: 'alex',
  })
  machine(on, { name: 'DESKTOP-ABC123', osrelease: '6.6.87.2-microsoft-standard-WSL2' })
  await $.session.start(START)

  expect(await footer($, 'desktop')).toBe('focus & wsl: DESKTOP-ABC123')
})

test('/where spells out the server, its address and where the connection comes from', async ($, on) => {
  mock.env(on, { SSH_CONNECTION: '203.0.113.9 51234 10.0.0.5 2222', USER: 'deploy' })
  machine(on, { name: 'web-01' })
  await $.session.start(START)

  const { text } = await $.command.run({
    command: 'where',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(text).toBe(
    [
      'Connection: SSH (remote server)',
      'Machine: web-01',
      'Address: 10.0.0.5:2222',
      'User: deploy',
      'Connected from: 203.0.113.9',
      'Directory: /home/deploy/app',
    ].join('\n'),
  )
})
