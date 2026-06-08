export type SearchQuery = {
  mailboxes?: string[];
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  unseen?: boolean;
  flagged?: boolean;
  deleted?: boolean;
  draft?: boolean;
  answered?: boolean;
  after?: string;
  before?: string;
  limit?: number;
  cursor?: string;
};

export function buildSearchCriteria(query: SearchQuery): Record<string, unknown> {
  const criteria: Record<string, unknown> = {};

  if (query.from) criteria.from = query.from;
  if (query.to) criteria.to = query.to;
  if (query.cc) criteria.cc = query.cc;
  if (query.subject) criteria.subject = query.subject;
  if (query.text) criteria.body = query.text;
  if (typeof query.unseen === 'boolean') criteria.seen = !query.unseen;
  if (typeof query.flagged === 'boolean') criteria.flagged = query.flagged;
  if (typeof query.deleted === 'boolean') criteria.deleted = query.deleted;
  if (typeof query.draft === 'boolean') criteria.draft = query.draft;
  if (typeof query.answered === 'boolean') criteria.answered = query.answered;
  if (query.after) criteria.after = query.after;
  if (query.before) criteria.before = query.before;
  if (query.mailboxes?.length) criteria.mailboxes = [...query.mailboxes];

  return criteria;
}
