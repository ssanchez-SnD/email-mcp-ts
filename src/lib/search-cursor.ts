export type SearchOrderValue = {
  mailbox: string;
  uid: number;
  date?: string | null;
};

export type SearchCursor = SearchOrderValue;

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeSearchCursor(cursor?: string): SearchCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { mailbox?: unknown; uid?: unknown; date?: unknown };
    return typeof parsed.mailbox === 'string' && typeof parsed.uid === 'number' && parsed.uid > 0
      ? {
          mailbox: parsed.mailbox,
          uid: parsed.uid,
          date: typeof parsed.date === 'string' || parsed.date === null ? parsed.date : undefined
        }
      : null;
  } catch {
    return null;
  }
}

export function compareSearchOrder(a: SearchOrderValue, b: SearchOrderValue) {
  if (a.date && b.date) {
    const dateA = Date.parse(a.date);
    const dateB = Date.parse(b.date);
    if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) return dateB - dateA;
  }
  if (a.mailbox !== b.mailbox) return a.mailbox.localeCompare(b.mailbox);
  return b.uid - a.uid;
}

export function isOlderThanCursor(summary: SearchOrderValue, cursor: SearchCursor | null | undefined) {
  if (!cursor) return true;
  return compareSearchOrder(summary, cursor) > 0;
}
