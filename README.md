# email-mcp-ts

Servidor MCP remoto en TypeScript que expone un buzón IMAP de solo lectura a Perplexity y ChatGPT vía **Streamable HTTP**.

## Herramientas v1

| Tool | Descripción |
|---|---|
| `get_unread_count` | Cuenta de correos no leídos y total en el buzón |
| `list_recent_emails` | Lista los N correos más recientes |
| `search_emails` | Busca por remitente, asunto, texto o estado no leído |
| `get_email` | Obtiene el detalle completo de un correo por UID |
| `list_folders` | Lista carpetas IMAP disponibles |

## Configuración

Copia `.env.example` a `.env` y rellena las variables.

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
