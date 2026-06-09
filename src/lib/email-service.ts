import { composeEmailMessage, type AttachmentInput } from './mime.js';
import { resolveSpecialUseFolders, type MailboxDescriptor } from './mailboxes.js';
import type { EmailDetail, EmailSummary, PaginationResult } from './imap.js';
import type { SearchQuery } from './query.js';

export type EmailWriteDeps = {
  listFolders: () => Promise<MailboxDescriptor[]>;
  getEmail: (uid: number, mailbox?: string) => Promise<EmailDetail | null>;
  searchEmails: (query: SearchQuery) => Promise<PaginationResult<EmailSummary>>;
  moveEmail: (uid: number, destination: string, mailbox?: string) => Promise<{ ok: boolean }>;
  deleteEmail: (uid: number, mailbox?: string) => Promise<{ ok: boolean }>;
  updateEmailFlags: (
    uid: number,
    flags: { seen?: boolean; flagged?: boolean; deleted?: boolean; draft?: boolean; answered?: boolean },
    mailbox?: string
  ) => Promise<{ ok: boolean }>;
  appendMessage: (mailbox: string, rawMessage: string, flags?: string[]) => Promise<{ ok: boolean }>;
  sendRawMessage: (rawMessage: string) => Promise<void>;
};

export type EmailWriteConfig = {
  fromAddress: string;
  defaultMailbox: string;
  sentMailbox?: string | null;
  draftsMailbox?: string | null;
};

export function createEmailService(deps: EmailWriteDeps, config: EmailWriteConfig) {
  function extractAddress(value: string) {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] ?? value).trim();
  }

  async function listFolders() {
    const folders = await deps.listFolders();
    return {
      folders,
      roles: resolveSpecialUseFolders(folders, {
        sent: config.sentMailbox ?? undefined,
        drafts: config.draftsMailbox ?? undefined
      })
    };
  }

  async function getEmail(mailbox: string, uid: number) {
    return deps.getEmail(uid, mailbox);
  }

  async function moveEmail(mailbox: string, uid: number, destination: string) {
    await deps.moveEmail(uid, destination, mailbox);
    return { ok: true };
  }

  async function deleteEmail(mailbox: string, uid: number) {
    await deps.deleteEmail(uid, mailbox);
    return { ok: true };
  }

  async function updateEmailFlags(
    mailbox: string,
    uid: number,
    flags: { seen?: boolean; flagged?: boolean; deleted?: boolean; draft?: boolean; answered?: boolean }
  ) {
    await deps.updateEmailFlags(uid, flags, mailbox);
    return { ok: true };
  }

  async function createDraft(input: {
    mailbox?: string;
    to: string[];
    cc?: string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: AttachmentInput[];
    inReplyTo?: string;
    references?: string[];
  }) {
    const folders = await listFolders();
    const draftsMailbox = input.mailbox ?? folders.roles.drafts;
    if (!draftsMailbox) throw new Error('Drafts mailbox could not be resolved');

    const raw = await composeEmailMessage({
      from: config.fromAddress,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments: input.attachments
    });

    await deps.appendMessage(draftsMailbox, raw, ['\\Draft']);
    return { mailbox: draftsMailbox, ok: true };
  }

  async function replyEmail(input: {
    mailbox?: string;
    uid: number;
    replyAll?: boolean;
    text?: string;
    html?: string;
    attachments?: AttachmentInput[];
  }) {
    const mailbox = input.mailbox ?? config.defaultMailbox;
    const original = await deps.getEmail(input.uid, mailbox);
    if (!original) throw new Error('Original email not found');

    const folders = await listFolders();
    const sentMailbox = folders.roles.sent;
    if (!sentMailbox) throw new Error('Sent mailbox could not be resolved');

    const to = input.replyAll
      ? [extractAddress(original.from), ...original.to, ...original.cc]
      : [extractAddress(original.from)];
    const raw = await composeEmailMessage({
      from: config.fromAddress,
      to: Array.from(new Set(to.map((value) => value.trim()).filter(Boolean))),
      subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
      text: input.text ?? '',
      html: input.html,
      inReplyTo: original.messageId ?? undefined,
      references: [...original.references, original.messageId].filter(Boolean) as string[],
      attachments: input.attachments
    });

    await deps.sendRawMessage(raw);
    await deps.appendMessage(sentMailbox, raw, ['\\Seen']);
    await deps.updateEmailFlags(input.uid, { answered: true }, mailbox);
    return { mailbox: sentMailbox, ok: true };
  }

  async function searchEmails(query: SearchQuery) {
    return deps.searchEmails(query);
  }

  return {
    listFolders,
    getEmail,
    moveEmail,
    deleteEmail,
    updateEmailFlags,
    createDraft,
    replyEmail,
    searchEmails
  };
}
