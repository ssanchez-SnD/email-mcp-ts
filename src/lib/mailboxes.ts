export type MailboxDescriptor = {
  path: string;
  specialUse?: string | null;
  subscribed?: boolean;
  delimiter?: string | null;
  flags?: Set<string> | string[] | null;
};

export type MailboxRoles = {
  sent: string | null;
  drafts: string | null;
  trash: string | null;
};

type RoleConfig = Partial<MailboxRoles>;

function normalizeSpecialUse(value?: string | null) {
  return (value ?? '').toLowerCase();
}

function findBySpecialUse(folders: MailboxDescriptor[], target: string) {
  const normalizedTarget = target.toLowerCase();
  return folders.find((folder) => normalizeSpecialUse(folder.specialUse) === normalizedTarget)?.path ?? null;
}

function findByPath(folders: MailboxDescriptor[], candidates: Array<string | null | undefined>) {
  const normalizedCandidates = candidates.filter(Boolean).map((candidate) => String(candidate).toLowerCase());
  if (!normalizedCandidates.length) return null;
  return folders.find((folder) => normalizedCandidates.includes(folder.path.toLowerCase()))?.path ?? null;
}

export function resolveSpecialUseFolders(folders: MailboxDescriptor[], fallback: RoleConfig = {}): MailboxRoles {
  const sent = findBySpecialUse(folders, '\\Sent') ?? findByPath(folders, [fallback.sent]) ?? fallback.sent ?? null;
  const drafts = findBySpecialUse(folders, '\\Drafts') ?? findByPath(folders, [fallback.drafts]) ?? fallback.drafts ?? null;
  const trash = findBySpecialUse(folders, '\\Trash') ?? findByPath(folders, [fallback.trash]) ?? fallback.trash ?? null;

  return { sent, drafts, trash };
}
