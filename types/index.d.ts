export type ConnectionKind = 'local' | 'ssh' | 'wsl'

export type Connection = {
  kind: ConnectionKind
  /** The machine Claude Code runs on: the server, for an SSH session. */
  host?: string
  user?: string
  /** From SSH_CONNECTION: the address and port the SSH client connected to. */
  serverIp?: string
  serverPort?: string
  /** From SSH_CONNECTION: the address the connection came from. */
  clientIp?: string
  distro?: string
}

declare module 'claude-code' {
  interface PluginState {
    'connection-badge': { connection: Connection | null }
  }
}
