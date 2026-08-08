# Docker and NAS setup

The published image supports Linux AMD64 and ARM64:

```text
ghcr.io/robje007/openprotonsync:latest
```

Docker is recommended for NAS installations. For native source builds, see the main
[README](README.md#native-installation).

## Self-contained Compose YAML

Generate a credential-encryption key:

```bash
openssl rand -base64 32
```

Paste it directly into the configuration if you do not want a separate `.env` file:

```yaml
name: proton-nas-sync

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
      - /your/host/folder:/data/files

    stop_grace_period: 30s

volumes:
  openprotonsync-config:
  openprotonsync-state:
```

The direct key is stored as plain text in the Compose definition. Restrict access to the file or
NAS project configuration. An `.env` reference remains available as an optional alternative.

## Start and authenticate

```bash
sudo docker compose pull
sudo docker compose up -d
sudo docker logs --tail 100 -f openprotonsync
```

Authenticate in the terminal:

```bash
sudo docker exec -it openprotonsync openprotonsync auth
```

The running service detects credentials without a restart. Open `http://localhost:4242` or use the
server's hostname/IP, then add the container path `/data/files` as a sync directory.

## Path mapping

Docker sees only explicitly mounted host directories:

```yaml
volumes:
  - /path/to/documents:/data/documents
  - /path/to/photos:/data/photos
```

Use `/data/documents` and `/data/photos` in the dashboard. The host paths on the left do not exist
inside the container.

## Secure web authentication

Browser login requires an additional token:

```bash
openssl rand -base64 48
```

Add it directly to the service environment:

```yaml
environment:
  KEYRING_PASSWORD: 'YOUR_EXISTING_KEY'
  TZ: 'UTC'
  DOCKER: '1'
  WEB_AUTH_ENABLED: '1'
  WEB_AUTH_ACCESS_TOKEN: 'PASTE_A_SEPARATE_TOKEN_OF_AT_LEAST_32_CHARACTERS'
```

Remote browser login requires an HTTPS reverse proxy and:

```yaml
WEB_AUTH_TRUST_PROXY: '1'
```

The proxy must set `X-Forwarded-Proto: https`. Block direct LAN access to port 4242 when proxy
headers are trusted.

## Persistent volumes

| Container path           | Contents                                |
| ------------------------ | --------------------------------------- |
| `/config/openprotonsync` | Configuration and encrypted credentials |
| `/state/openprotonsync`  | SQLite state, queues, locks, and logs   |
| `/data/...`              | Mounted local files                     |

Back up the config volume together with the separately stored encryption key. Never publish either.

## Useful commands

```bash
sudo docker exec openprotonsync openprotonsync --version
sudo docker exec openprotonsync openprotonsync status
sudo docker exec openprotonsync openprotonsync config sync-dir --list
sudo docker exec openprotonsync openprotonsync config exclude --list
sudo docker exec openprotonsync openprotonsync pause
sudo docker exec openprotonsync openprotonsync resume
sudo docker exec openprotonsync openprotonsync reconcile
sudo docker exec openprotonsync openprotonsync unlock
sudo docker logs --tail 200 -f openprotonsync
```

## Updating

```bash
sudo docker compose pull
sudo docker compose up -d
```

Named volumes remain intact. Keep the same `KEYRING_PASSWORD` after an update.

## NAS kernel restrictions

Do not add container-level `fs.inotify.*` sysctls on Ugreen or other restricted NAS kernels. Some
kernels reject them because those settings are not namespaced. Configure host limits only through a
vendor-supported mechanism.

## Troubleshooting

### Local path does not exist

```bash
sudo docker exec openprotonsync ls -la /data
```

Use the displayed container path in the dashboard.

### Missing authentication

Confirm that the correct config volume and original `KEYRING_PASSWORD` are configured. Then run:

```bash
sudo docker exec -it openprotonsync openprotonsync auth
```

### Stale process lock

```bash
sudo docker exec openprotonsync openprotonsync status
sudo docker exec openprotonsync openprotonsync unlock
```

The unlock command refuses to remove the lock of a verified live process.
