import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Connection } from '../types'

const connection = atom({ plugin: 'connection-badge', key: 'connection' } as const, null)

const KINDS = {
  local: 'local (this computer)',
  ssh: 'SSH (remote server)',
  wsl: 'WSL (Linux on this computer)',
} as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'where',
      description: 'Show whether this session runs locally or over SSH, and on which server',
    })
    const found = await detect($)
    await update($, connection, () => found)

    return next(e)
  })

  // The footer under the prompt. The terminal draws the mode labels it is
  // handed; the desktop app draws only a tree a hook returns.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const found = await read($, connection)

    if (found === null) {
      return next(e)
    }

    const modes = [...e.props.modes, badge(found)]

    if (e.surface === 'desktop') {
      const { Text } = $.ui.resolve(e)

      return <Text>{modes.join(' & ')}</Text>
    }

    return next({ ...e, props: { ...e.props, modes } })
  })

  on('command.run', { command: 'where' }, async $ => {
    const found = (await read($, connection)) ?? (await detect($))

    return { text: describe(found, await $.session.cwd()) }
  })
}

async function detect($: EngineInterface): Promise<Connection> {
  const [sshConnection, sshClient, sshTty, wslDistro, execPath, user, logname, username] =
    await Promise.all([
      $.env.get('SSH_CONNECTION'),
      $.env.get('SSH_CLIENT'),
      $.env.get('SSH_TTY'),
      $.env.get('WSL_DISTRO_NAME'),
      $.env.get('CLAUDE_CODE_EXECPATH'),
      $.env.get('USER'),
      $.env.get('LOGNAME'),
      $.env.get('USERNAME'),
    ])
  const base = { host: await hostname($), user: user || logname || username }

  // What Claude Code itself checks to tell it runs over SSH.
  if (sshConnection || sshClient || sshTty) {
    return clean({ kind: 'ssh', ...base, ...parseSsh(sshConnection, sshClient) })
  }

  if (wslDistro) {
    return clean({ kind: 'wsl', ...base, distro: wslDistro })
  }

  // The desktop app runs a remote session from the copy of Claude Code it
  // installs under ~/.claude/remote on that machine (a server or a WSL distro).
  if (execPath !== undefined && /[\\/]\.claude[\\/]remote[\\/]/.test(execPath)) {
    return clean({ kind: (await isWsl($)) ? 'wsl' : 'ssh', ...base })
  }

  return clean({ kind: 'local', ...base })
}

async function hostname($: EngineInterface): Promise<string | undefined> {
  const windows = await $.env.get('COMPUTERNAME')

  if (windows) {
    return windows
  }

  const linux = await $.fs.read('/proc/sys/kernel/hostname').catch(() => '')

  if (linux.trim() !== '') {
    return linux.trim()
  }

  const ran = await $.process.run(['hostname'], { timeoutMs: 3000 }).catch(() => undefined)

  return ran?.exitCode === 0 && ran.stdout.trim() !== '' ? ran.stdout.trim() : undefined
}

async function isWsl($: EngineInterface): Promise<boolean> {
  const release = await $.fs.read('/proc/sys/kernel/osrelease').catch(() => '')

  return /microsoft|wsl/i.test(release)
}

function parseSsh(connection: string | undefined, client: string | undefined) {
  // SSH_CONNECTION is "<client ip> <client port> <server ip> <server port>"
  const full = connection?.trim().split(/\s+/) ?? []

  if (full.length >= 4) {
    return { clientIp: full[0], serverIp: full[2], serverPort: full[3] }
  }

  // SSH_CLIENT is "<client ip> <client port> <server port>"
  const short = client?.trim().split(/\s+/) ?? []

  if (short.length >= 3) {
    return { clientIp: short[0], serverPort: short[2] }
  }

  return {}
}

// $.state holds JSON data: leave out the fields nothing was found for.
function clean(found: Connection): Connection {
  return Object.fromEntries(
    Object.entries(found).filter(([, value]) => value !== undefined && value !== ''),
  ) as Connection
}

function badge(found: Connection): string {
  if (found.kind === 'ssh') {
    const user = found.user === undefined ? '' : `${found.user}@`
    const ip = found.host !== undefined && found.serverIp !== undefined ? ` (${found.serverIp})` : ''

    return `ssh: ${user}${found.host ?? found.serverIp ?? 'remote server'}${ip}`
  }

  if (found.kind === 'wsl') {
    return `wsl: ${found.distro ?? found.host ?? 'Linux'}`
  }

  return found.host === undefined ? 'local' : `local: ${found.host}`
}

function describe(found: Connection, cwd: string): string {
  const port = found.serverPort === undefined ? '' : `:${found.serverPort}`
  const address =
    found.serverIp === undefined
      ? undefined
      : found.serverIp.includes(':') && port !== ''
        ? `[${found.serverIp}]${port}`
        : `${found.serverIp}${port}`
  const rows: [string, string | undefined][] = [
    ['Connection', KINDS[found.kind]],
    ['Machine', found.host],
    ['Address', address],
    ['User', found.user],
    ['WSL distro', found.distro],
    ['Connected from', found.clientIp],
    ['Directory', cwd],
  ]

  return rows
    .filter((row): row is [string, string] => row[1] !== undefined)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}
