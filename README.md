# OpenProtonSync

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/robje007)

**OpenProtonSync** is a substantially enhanced fork of
[proton-drive-sync](https://github.com/DamianB-BitFlipper/proton-drive-sync), built for local
computers, home servers, NAS systems, and Docker. It adds bug fixes, a richer web dashboard,
safer backup controls, and an opt-in **two-way sync beta**.

> OpenProtonSync is an independent GPL-3.0 fork. Credit for the original project goes to the
> [proton-drive-sync contributors](https://github.com/DamianB-BitFlipper/proton-drive-sync/graphs/contributors).
> It is not affiliated with or endorsed by Proton AG. Please report OpenProtonSync issues in
> [this repository](https://github.com/Robje007/OpenProtonSync/issues), not to the upstream project.

If OpenProtonSync is useful to you, you can [support its development on Ko-fi](https://ko-fi.com/robje007).

The application, CLI, packages, container image, services, and configuration paths all use the
OpenProtonSync name.

## Features

- Upload-only backup or two-way beta, selectable per folder mapping.
- Remote event monitoring with a periodic reconciliation safety net.
- Atomic downloads: a partial download never replaces the destination file.
- Simultaneous edits keep both versions in `.proton-sync-conflicts`.
- Remote deletes move the local copy to `.proton-sync-recovery`.
- Dashboard for mappings, queues, logs, pause/resume, and optional username/password protection.
- Per-mapping folder and file exclusions, editable from both the dashboard and interactive CLI.
- Large-tree scanning with useful defaults such as `node_modules` and `.venv` exclusions.
- Docker images for AMD64 and ARM64, plus native CLI support.
- Official `@protontech/drive-sdk` 0.19.2 integration.

## Docker quick start

Generate a key for encrypting the stored Proton session:

```bash
openssl rand -base64 32
```

Paste that key directly into this Compose configuration—no separate `.env` file is required:

```yaml
name: openprotonsync

services:
  openprotonsync:
    image: ghcr.io/robje007/openprotonsync:latest
    pull_policy: always
    container_name: openprotonsync
    restart: unless-stopped

    environment:
      KEYRING_PASSWORD: 'PASTE_YOUR_GENERATED_KEY_HERE'
      TZ: 'UTC'
      DOCKER: '1'

    ports:
      - '4242:4242'

    volumes:
      - openprotonsync-config:/config/openprotonsync
      - openprotonsync-state:/state/openprotonsync
      - /path/on/your/host:/data/files

    stop_grace_period: 30s

volumes:
  openprotonsync-config:
  openprotonsync-state:
```

When upgrading from the original package name, migrate the contents of the old config and state
volumes to `openprotonsync-config` and `openprotonsync-state` before removing the old container.
Keep the same `KEYRING_PASSWORD`, otherwise stored Proton credentials cannot be decrypted.

Native installations automatically copy legacy configuration, state, and desktop keychain
credentials into the new OpenProtonSync locations on first launch.

Keep `KEYRING_PASSWORD` unchanged after authentication. Anyone who can read the Compose YAML can
read this key, so restrict access to the configuration and never commit it.

Start the container:

```bash
sudo docker compose up -d
sudo docker exec -it openprotonsync openprotonsync auth
sudo docker logs --tail 100 -f openprotonsync
```

The service notices saved authentication automatically; a restart after `auth` is not required.
Open `http://localhost:4242` (or use the server's hostname/IP) and add a mapping such as:

```text
/data/files → /Backups
```

Use the path **inside the container**. With `/path/on/your/host:/data/files`, the dashboard must use
`/data/files`, not the host path.

## Sign in to Proton

Authentication is performed in the CLI, not on the normal dashboard page. For Docker, run:

```bash
sudo docker exec -it openprotonsync openprotonsync auth
```

For a native installation, run:

```bash
openprotonsync auth
```

The command asks for your Proton username or email address and account password. Depending on your
account settings, it may then ask for:

- A six-digit two-factor authentication code from your authenticator app. Security keys are not
  currently supported by this client.
- Your mailbox password when your Proton account uses two-password mode.

Successful authentication ends with `Credentials saved securely.` The saved session is reused and
refreshed automatically, so you do not need to enter your password every time the sync service
starts. In Docker, the already-running service detects the new session automatically; no container
restart is required.

To replace an existing session, run the same `auth` command and confirm that you want to
re-authenticate. To sign out and remove the stored session, run:

```bash
# Docker
sudo docker exec -it openprotonsync openprotonsync auth --logout

# Native installation
openprotonsync auth --logout
```

The optional browser sign-in described below is disabled by default. It is intended for remotely
authenticating an already-running Docker service; CLI authentication remains the simplest and most
secure option.

## Upload-only or two-way beta

Every mapping has its own direction:

- **Local → Drive** is the default. Local additions, changes, moves, and deletes are sent to Drive.
- **Two-way (beta)** also downloads changes made in Proton Drive.

Enable two-way in **Settings → Backup configuration → Direction**. Existing configurations without
a direction remain upload-only after upgrading.

For a new native or Docker CLI mapping, add `--two-way`:

```bash
sudo docker exec openprotonsync openprotonsync config sync-dir \
  --add /data/files --remote /Backups --two-way
```

The first two-way scan is deliberately conservative:

- Equal files are adopted without another transfer.
- If different local and remote files already have the same path, the remote version is downloaded
  to `.proton-sync-conflicts/<timestamp>/...`.
- If both sides change after the baseline, both versions are kept in the same way.
- A remote delete moves the local version to `.proton-sync-recovery/<timestamp>/...`.
- Safety and temporary folders are never uploaded.

After inspecting a conflict, keep the desired file at its normal path and edit or replace it once;
that intentional local change is then uploaded.

The beta is built on the official SDK's download and Drive-event APIs. Proton currently labels its
SDK as not generally available for third-party production applications, so keep another backup of
important data and expect beta behavior to evolve.

## Upgrade without losing configuration

The named `config` and `state` volumes contain authentication, mappings, and sync history. A normal
image upgrade preserves them:

```bash
sudo docker compose pull
sudo docker compose up -d
sudo docker logs --tail 100 -f openprotonsync
```

Do **not** run `sudo docker compose down -v`; `-v` deletes the named volumes. Also keep the existing
`KEYRING_PASSWORD`, config volume name, and state volume name unchanged.

To confirm the running image:

```bash
sudo docker inspect openprotonsync --format '{{.Config.Image}}'
sudo docker exec openprotonsync openprotonsync --version
```

## Useful Docker commands

```bash
# Show mappings
sudo docker exec openprotonsync openprotonsync config sync-dir --list

# Show exclusions
sudo docker exec openprotonsync openprotonsync config exclude --list

# Authenticate again
sudo docker exec -it openprotonsync openprotonsync auth

# Safely clear a verified stale process lock
sudo docker exec openprotonsync openprotonsync unlock

# Restart and follow logs
sudo docker restart openprotonsync
sudo docker logs --tail 100 -f openprotonsync
```

## Optional dashboard sign-in

CLI authentication is the simplest choice. Browser sign-in is disabled by default. To enable it,
generate a separate access token:

```bash
openssl rand -base64 48
```

Add both values directly under the Compose `environment` section:

```yaml
WEB_AUTH_ENABLED: '1'
WEB_AUTH_ACCESS_TOKEN: 'PASTE_A_SEPARATE_TOKEN_OF_AT_LEAST_32_CHARACTERS'
```

Never reuse `KEYRING_PASSWORD` as this token. Browser sign-in over plain HTTP is limited to
`localhost`. For access from another machine, place the dashboard behind an authenticated HTTPS
reverse proxy or VPN. Only then add `WEB_AUTH_TRUST_PROXY: '1'` and bind the direct port to
`127.0.0.1:4242:4242`.

## Native installation

Docker works well on a server or NAS, but the application is not Docker-only. A native build requires
[Bun](https://bun.sh/), Git, a C/C++ build toolchain, Python, and the platform dependencies needed
by `keytar`.

```bash
git clone https://github.com/Robje007/OpenProtonSync.git
cd openprotonsync
bun install
bun run build
bun link
openprotonsync auth
openprotonsync config
openprotonsync start
```

Native configuration is stored below the normal platform config/state directories. Run
`openprotonsync config --help` for non-interactive commands and `openprotonsync start --help`
for one-shot, watch, dry-run, and service options.

## Exclusions

New configurations exclude common generated dependency directories:

```text
node_modules
.npm
.pnpm-store
.yarn/cache
__pycache__
.venv
venv
```

Your source, dotfiles, and `.git` directory remain included unless you exclude them yourself. Large
generated directories should be excluded instead of synchronized.

Platform recycle folders such as `#recycle`, `$RECYCLE.BIN`, `.Trash`, and `.Trashes` are always
excluded, including when an older configuration contains an explicitly empty exclusion list.

Exclusions can be scoped to one selected backup mapping. Patterns are relative globs and apply at
every depth within that mapping:

```bash
openprotonsync config exclude --path /data/photos --add private '*.tmp' '**/*.raw'
openprotonsync config exclude --path /data/photos --list
openprotonsync config exclude --path /data/photos --remove '*.tmp'
```

Use `/` as the path to apply a pattern to every configured backup mapping.

## Protecting the dashboard

The web interface can optionally require a username and password. Open **Settings → Dashboard
security**, enable protection, and enter a username and a password of at least 12 characters. The
setting protects dashboard pages, assets, event streams, and API endpoints.

Only a salted scrypt password hash is stored in the configuration. HTTP Basic credentials are not
encrypted in transit, so place the dashboard behind HTTPS when accessing it over a network.

## Troubleshooting

### “Local path does not exist”

Use the container-side mount path, for example `/data/files`.

### “Another instance is already running”

Do not start a second sync process with `docker exec`. The container already runs it. If no process
is actually active, use the `unlock` command shown above.

### “Refresh token expired”

Run `openprotonsync auth` again. In Docker, the container stays online and checks for updated
credentials once per minute without flooding its logs.

### Dashboard is not reachable

Check `sudo docker ps` for `0.0.0.0:4242->4242/tcp`, then inspect the logs. The dashboard must bind
to `0.0.0.0` inside Docker; the image handles this automatically.

### A project generates thousands of jobs

Exclude dependency, cache, build-output, and virtual-environment folders. Source-control working
trees usually do not need `node_modules` synchronized.

## Development

```bash
bun install
bun run build:check
bun test
bun run build
```

Contributions and beta reports are welcome on GitHub. This project is GPL-3.0 licensed.
