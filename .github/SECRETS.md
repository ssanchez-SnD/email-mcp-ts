# GitHub Actions Secrets

Configura estos secrets en tu repositorio:
**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Descripción | Ejemplo |
|---|---|---|
| `VPS_HOST` | IP o dominio de tu VPS | `123.45.67.89` o `vps.staffndev.cloud` |
| `VPS_USER` | Usuario SSH | `deploy` o `root` |
| `VPS_SSH_KEY` | **Clave SSH privada** (contenido completo, no la pública) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_PORT` | Puerto SSH (opcional, default 22) | `22` |
| `APP_DIR` | Ruta absoluta del proyecto en el VPS | `/opt/email-mcp-ts` |

## Preparar el VPS (una sola vez)

```bash
# 1. Crear directorio del proyecto
mkdir -p /opt/email-mcp-ts
cd /opt/email-mcp-ts

# 2. Clonar el repositorio
git clone https://github.com/ssanchez-SnD/email-mcp-ts .

# 3. Crear el archivo .env con tus credenciales reales
cp .env.example .env
nano .env

# 4. Primer deploy manual
docker compose up -d --build
```

## Generar clave SSH para el deploy

```bash
# En tu máquina local, genera un par de claves dedicado para CI
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""

# Copia la clave pública al VPS
ssh-copy-id -i ~/.ssh/deploy_key.pub user@tu-vps

# El contenido de deploy_key (privada) va al secret VPS_SSH_KEY
cat ~/.ssh/deploy_key
```

## Flujo automático

Cada `git push` a `main` → GitHub Actions → SSH al VPS → `git pull` → `docker compose up -d --build`

> También puedes definir `VPS_HOST`, `VPS_USER`, `VPS_PORT` y `APP_DIR` como **Repository Variables** (Actions → Variables). El workflow primero usa Secrets y luego Variables como fallback.
