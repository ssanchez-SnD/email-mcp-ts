import { randomBytes } from 'node:crypto';

export type AttachmentInput = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type ComposeEmailInput = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: AttachmentInput[];
  messageId?: string;
  date?: Date;
};

function wrapBase64(input: string) {
  return input.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function boundary(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function encodeUtf8Part(contentType: string, body: string) {
  return [
    `Content-Type: ${contentType}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(body, 'utf8').toString('base64'))
  ].join('\r\n');
}

function encodeAttachment(attachment: AttachmentInput) {
  const content = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content, 'utf8');
  return [
    `Content-Type: ${attachment.contentType ?? 'application/octet-stream'}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(content.toString('base64'))
  ].join('\r\n');
}

export async function composeEmailMessage(input: ComposeEmailInput): Promise<string> {
  const mixedBoundary = boundary('mixed');
  const altBoundary = boundary('alt');
  const lines: string[] = [];
  const messageId = input.messageId ?? `<${randomBytes(12).toString('hex')}@localhost>`;
  const date = (input.date ?? new Date()).toUTCString();

  lines.push(`Message-ID: ${messageId}`);
  lines.push(`Date: ${date}`);
  lines.push(`From: ${input.from}`);
  lines.push(`To: ${input.to.join(', ')}`);
  if (input.cc?.length) lines.push(`Cc: ${input.cc.join(', ')}`);
  lines.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references?.length) lines.push(`References: ${input.references.join(' ')}`);
  lines.push('MIME-Version: 1.0');

  const hasHtml = typeof input.html === 'string' && input.html.length > 0;
  const hasText = typeof input.text === 'string' && input.text.length > 0;
  const hasAttachments = (input.attachments?.length ?? 0) > 0;

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');
    lines.push(`--${mixedBoundary}`);

    if (hasText && hasHtml) {
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');
      lines.push(`--${altBoundary}`);
      lines.push(encodeUtf8Part('text/plain', input.text ?? ''));
      lines.push(`--${altBoundary}`);
      lines.push(encodeUtf8Part('text/html', input.html ?? ''));
      lines.push(`--${altBoundary}--`);
    } else if (hasHtml) {
      lines.push(encodeUtf8Part('text/html', input.html ?? ''));
    } else {
      lines.push(encodeUtf8Part('text/plain', input.text ?? ''));
    }

    for (const attachment of input.attachments ?? []) {
      lines.push(`--${mixedBoundary}`);
      lines.push(encodeAttachment(attachment));
    }
    lines.push(`--${mixedBoundary}--`);
    return lines.join('\r\n');
  }

  if (hasText && hasHtml) {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(`--${altBoundary}`);
    lines.push(encodeUtf8Part('text/plain', input.text ?? ''));
    lines.push(`--${altBoundary}`);
    lines.push(encodeUtf8Part('text/html', input.html ?? ''));
    lines.push(`--${altBoundary}--`);
    return lines.join('\r\n');
  }

  if (hasHtml) {
    lines.push(encodeUtf8Part('text/html', input.html ?? ''));
    return lines.join('\r\n');
  }

  lines.push(encodeUtf8Part('text/plain', input.text ?? ''));
  return lines.join('\r\n');
}
