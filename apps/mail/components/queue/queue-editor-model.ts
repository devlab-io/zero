export type EditableQueueDraft = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
};

export const normalizeEditableAddress = (value: string) => {
  const trimmed = value.trim();
  const angleAddress = trimmed.match(/<([^<>]+)>/u)?.[1];
  return (angleAddress ?? trimmed).replace(/^<|>$/gu, '').trim();
};

export const normalizeEditableAddresses = (values: readonly string[]) =>
  Array.from(new Set(values.map(normalizeEditableAddress).filter(Boolean)));

export const parseEditableAddressList = (value: string) =>
  normalizeEditableAddresses(value.split(','));

export const draftSignature = (draft: EditableQueueDraft) =>
  JSON.stringify({
    ...draft,
    to: normalizeEditableAddresses(draft.to),
    cc: normalizeEditableAddresses(draft.cc),
    bcc: normalizeEditableAddresses(draft.bcc),
  });

export const isLegacyWorkerRuntimeError = (error?: string | null) =>
  Boolean(error && /(code 127|env: node: No such file|spawn .*ENOENT)/iu.test(error));
