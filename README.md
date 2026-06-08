# email-mcp-ts

Servidor MCP remoto en TypeScript para correo IMAP/SMTP con lectura y escritura. Expone herramientas para consultar, buscar, mover, eliminar, marcar, crear borradores y responder mensajes, guardando copias enviadas en la carpeta `Sent` del servidor.

## Estado

- Soporta lectura de buzón, detalle de mensajes, búsqueda y paginación.
- Soporta escritura segura: mover, borrar, actualizar flags, crear borradores y responder por SMTP.
- Resuelve carpetas especiales como `Sent` y `Drafts` por `specialUse`, con respaldo por configuración.
- Validado contra un servidor real con autenticación IMAP y SMTP.

## Herramientas

| Tool | Descripción |
|---|---|
| `get_unread_count` | Devuelve total y no leídos del buzón configurado |
| `list_folders` | Lista carpetas IMAP con metadatos y `specialUse` |
| `list_recent_emails` | Lista correos recientes con cursor |
| `get_email` | Devuelve el detalle completo de un mensaje |
| `search_emails` | Busca por remitente, destinatario, asunto, texto, flags o carpetas |
| `move_email` | Mueve un correo a otra carpeta |
| `delete_email` | Elimina un correo |
| `update_email_flags` | Marca `seen`, `flagged`, `deleted`, `draft` o `answered` |
| `create_draft` | Guarda un borrador en `Drafts` |
| `reply_email` | Responde por SMTP y guarda copia en `Sent` |

## Requisitos

- Node.js 22+
- Acceso IMAP y SMTP al servidor de correo
- Variables de entorno para credenciales y carpetas especiales

## Configuración

Copiar `.env.example` a `.env` y completar los valores.

Variables importantes:

- `PORT` y `MCP_PATH`
- `API_KEY`
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USERNAME`, `IMAP_PASSWORD`, `IMAP_MAILBOX`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`
- `SENT_MAILBOX`, `DRAFTS_MAILBOX`, `TRASH_MAILBOX` si el servidor no expone `specialUse`

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
- No imprimas `API_KEY`, `IMAP_PASSWORD` ni credenciales SMTP
- Usa HTTPS en producción
- Rota las credenciales periódicamente

## Validación

La implementación fue verificada con pruebas sobre un buzón real para confirmar:

- autenticación IMAP y SMTP
- resolución de carpetas `Sent` y `Drafts`
- búsqueda y lectura de mensajes
- movimiento, borrado y actualización de flags
- creación de borradores
- envío de respuestas con copia guardada en `Sent`
