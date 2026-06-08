import net from 'node:net';
import tls from 'node:tls';
import { config } from './config.js';

function parseResponse(chunk: string) {
  const lines = chunk.trimEnd().split(/\r?\n/);
  const last = lines.at(-1) ?? '';
  const match = last.match(/^(\d{3})\s/);
  return {
    code: match ? Number(match[1]) : NaN,
    lines
  };
}

async function waitForConnection(socket: net.Socket | tls.TLSSocket) {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off('error', onError);
      socket.off('connect', onConnect);
      socket.off('secureConnect', onConnect);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
    socket.on('secureConnect', onConnect);
  });
}

async function readResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.trimEnd().split(/\r?\n/);
      const last = lines.at(-1) ?? '';
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(parseResponse(buffer));
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function writeCommand(socket: net.Socket | tls.TLSSocket, command: string) {
  socket.write(`${command}\r\n`);
}

function encodeAuthPlain(username: string, password: string) {
  return Buffer.from(`\u0000${username}\u0000${password}`, 'utf8').toString('base64');
}

function encodeAuthLogin(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function authenticate(socket: net.Socket | tls.TLSSocket, username: string, password: string) {
  await writeCommand(socket, `AUTH PLAIN ${encodeAuthPlain(username, password)}`);
  let response = await readResponse(socket);
  if (response.code === 235) return;

  await writeCommand(socket, 'AUTH LOGIN');
  response = await readResponse(socket);
  if (response.code !== 334) throw new Error(`SMTP auth rejected: ${response.lines.at(-1) ?? 'unknown'}`);

  await writeCommand(socket, encodeAuthLogin(username));
  response = await readResponse(socket);
  if (response.code !== 334) throw new Error(`SMTP username rejected: ${response.lines.at(-1) ?? 'unknown'}`);

  await writeCommand(socket, encodeAuthLogin(password));
  response = await readResponse(socket);
  if (response.code !== 235) throw new Error(`SMTP password rejected: ${response.lines.at(-1) ?? 'unknown'}`);
}

export async function sendRawMessage(rawMessage: string) {
  const port = config.smtp.port;
  const socket = config.smtp.secure
    ? tls.connect({ host: config.smtp.host, port, servername: config.smtp.host })
    : net.connect({ host: config.smtp.host, port });

  await waitForConnection(socket);
  socket.setEncoding('utf8');

  const greeting = await readResponse(socket);
  if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.lines.at(-1) ?? 'unknown'}`);

  await writeCommand(socket, `EHLO ${config.smtp.ehloHost}`);
  let response = await readResponse(socket);
  if (response.code !== 250) {
    await writeCommand(socket, `HELO ${config.smtp.ehloHost}`);
    response = await readResponse(socket);
    if (response.code !== 250) throw new Error(`SMTP EHLO/HELO failed: ${response.lines.at(-1) ?? 'unknown'}`);
  }

  await authenticate(socket, config.smtp.user, config.smtp.pass);
  await writeCommand(socket, `MAIL FROM:<${config.smtp.from}>`);
  response = await readResponse(socket);
  if (response.code !== 250) throw new Error(`SMTP MAIL FROM failed: ${response.lines.at(-1) ?? 'unknown'}`);

  const recipients = rawMessage.match(/^To:\s*(.+)$/im)?.[1]?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const ccRecipients = rawMessage.match(/^Cc:\s*(.+)$/im)?.[1]?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  for (const recipient of [...recipients, ...ccRecipients]) {
    await writeCommand(socket, `RCPT TO:<${recipient}>`);
    response = await readResponse(socket);
    if (response.code !== 250 && response.code !== 251) {
      throw new Error(`SMTP RCPT TO failed for ${recipient}: ${response.lines.at(-1) ?? 'unknown'}`);
    }
  }

  await writeCommand(socket, 'DATA');
  response = await readResponse(socket);
  if (response.code !== 354) throw new Error(`SMTP DATA failed: ${response.lines.at(-1) ?? 'unknown'}`);

  socket.write(`${rawMessage.replace(/\r?\n/g, '\r\n')}\r\n.\r\n`);
  response = await readResponse(socket);
  if (response.code !== 250) throw new Error(`SMTP send failed: ${response.lines.at(-1) ?? 'unknown'}`);

  await writeCommand(socket, 'QUIT');
  await readResponse(socket).catch(() => undefined);
  socket.end();
}
