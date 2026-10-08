# connection-badge

A Claude Code mod that shows, in the footer under the prompt, whether the session runs on your own computer or on a server over SSH, and which server.

| Session | Footer label |
| --- | --- |
| Local | `local: DESKTOP-ABC123` |
| SSH | `ssh: deploy@web-01 (10.0.0.5)` |
| WSL | `wsl: Ubuntu` |

`/where` prints the details: connection type, machine name, address and port, user, the address the connection comes from, and the working directory.

It draws in the terminal and in the Claude desktop app's Code tab. Mods are an early-access Claude Code feature; this one is built and tested on Claude Code 2.1.293.

## Install

In Claude Code in a terminal:

```
/plugin install connection-badge --marketplace filiptaka/connection-badge
```

Answer `y` to add the marketplace, then pick a scope.

Or from a shell:

```bash
claude plugin marketplace add filiptaka/connection-badge
claude plugin install connection-badge@connection-badge
```

### SSH sessions from the desktop app

When the desktop app opens an SSH session, Claude Code runs on the server, so install the mod on each server too (the shell commands above, run there).

### From a folder instead

Clone the repo and point Claude Code at the folder in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/connection-badge" } }
```

## How it decides

- **SSH**: `SSH_CONNECTION`, `SSH_CLIENT` or `SSH_TTY` is set, the same check Claude Code makes, or Claude Code runs from the copy the desktop app installs under `~/.claude/remote/`.
- **WSL**: `WSL_DISTRO_NAME` is set, or the kernel release names Microsoft.
- **Local**: anything else.

The server's name is its own hostname, and its address comes from `SSH_CONNECTION`.

## Development

```bash
claude plugin validate .
claude plugin test .
```
