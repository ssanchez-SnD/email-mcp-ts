# email-mcp-ts

Servidor MCP remoto en TypeScript que expone un buzón IMAP de solo lectura a Perplexity y ChatGPT vía **Streamable HTTP**.

## Herramientas v1

| Tool | Descripción |
|---|---|
| `get_unread_count` | Cuenta de correos no leídos y total en el buzón |
| `list_recent_emails` | Lista los N correos más recientes (con paginación por cursor) |
| `search_emails` | Busca por remitente, asunto, texto o estado no leído (con paginación por cursor) |
| `get_email` | Obtiene el detalle completo de un correo por UID |
| `list_folders` | Lista carpetas IMAP disponibles |

## Paginación por cursor

`list_recent_emails` y `search_emails` devuelven:

- `items`: resultados de la página actual
- `hasMore`: indica si hay más correos por consultar
- `nextCursor`: cursor para pedir la página siguiente

Ejemplo de request:

```json
{
  "tool": "search_emails",
  "arguments": {
    "subject": "factura",
    "limit": 10,
    "cursor": "eyJ1aWQiOjEyMzR9"
  }
}
```

## Resiliencia y seguridad

- Operaciones IMAP con timeout y reintentos automáticos para errores transitorios
- Sanitización real de HTML al devolver `htmlBodySanitized`
- Rate limiting global y específico para endpoint MCP
- Autenticación por `Authorization: Bearer <API_KEY>`

## Configuración

Copia `.env.example` a `.env` y rellena las variables.

Variables relevantes:

- `PORT` (default `3000`)
- `MCP_PATH` (default `/mcp`)
- `API_KEY` (obligatoria)
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`
- `IMAP_USERNAME`, `IMAP_PASSWORD`
- `IMAP_MAILBOX` (default `INBOX`)

## Desarrollo local

```bash
npm install
npm run dev
```

## Producción con Docker

```bash
docker compose up -d --build
```

## Seguridad

- Nunca subas `.env` al repositorio
- Usa HTTPS en producción (Traefik + Let's Encrypt)
- Rota el `API_KEY` periódicamente
