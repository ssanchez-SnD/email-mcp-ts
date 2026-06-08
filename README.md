# email-mcp-ts

Servidor MCP remoto en TypeScript que expone un buzon IMAP de lectura y escritura via **Streamable HTTP**.

## Herramientas

| Tool | Descripcion |
|---|---|
| `get_unread_count` | Cuenta de correos no leidos y total en el buzon |
| `list_recent_emails` | Lista los N correos mas recientes, con paginacion por cursor |
| `search_emails` | Busca por remitente, destinatario, asunto, texto, flags o carpetas |
| `get_email` | Obtiene el detalle completo de un correo por UID y carpeta |
| `list_folders` | Lista carpetas IMAP disponibles con `specialUse` y metadatos |
| `move_email` | Mueve un correo a otra carpeta |
| `delete_email` | Elimina un correo |
| `update_email_flags` | Marca leido/no leido, flag, borrado, draft o answered |
| `create_draft` | Guarda un borrador en Drafts |
| `reply_email` | Responde un correo, lo envia por SMTP y guarda copia en Sent |

## Paginacion por cursor

`list_recent_emails` y `search_emails` devuelven:

- `items`: resultados de la pagina actual
- `hasMore`: indica si hay mas correos por consultar
- `nextCursor`: cursor para pedir la pagina siguiente

Ejemplo:

```json
{
  "tool": "search_emails",
  "arguments": {
    "subject": "factura",
    "limit": 10,
    "cursor": "eyJtYWlsYm94IjoiSU5CT1giLCJ1aWQiOjEyMzR9"
  }
}
```

## Resiliencia y seguridad

- Operaciones IMAP con timeout y reintentos automaticos para errores transitorios
- Sanitizacion de HTML al devolver `htmlBodySanitized`
- Rate limiting global y especifico para endpoint MCP
- Autenticacion por `Authorization: Bearer <API_KEY>`
- Los secretos solo se leen desde variables de entorno y no se imprimen en logs

## Configuracion

Copia `.env.example` a `.env` y rellena las variables.

Variables relevantes:

- `PORT` (default `3000`)
- `MCP_PATH` (default `/mcp`)
- `API_KEY` (obligatoria)
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`
- `IMAP_USERNAME`, `IMAP_PASSWORD`
- `IMAP_MAILBOX` (default `INBOX`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
- `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`
- `SENT_MAILBOX`, `DRAFTS_MAILBOX`, `TRASH_MAILBOX` (opcionales, si el servidor no expone `specialUse`)

## Desarrollo local

```bash
npm install
npm run dev
```

## Produccion con Docker

```bash
docker compose up -d --build
```

## Seguridad

- Nunca subas `.env` al repositorio
- No imprimas ni registres `API_KEY`, `IMAP_PASSWORD` ni credenciales SMTP
- Usa HTTPS en produccion (Traefik + Let's Encrypt)
- Rota el `API_KEY` periodicamente
