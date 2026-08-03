export type MailSplitLayout = {
  listDefault: number;
  listMin: number;
  listMax: number;
  readerDefault?: number;
  readerMin?: number;
};

const LIST_ONLY_LAYOUT: MailSplitLayout = {
  listDefault: 100,
  listMin: 100,
  listMax: 100,
};

const WIDE_READER_LAYOUT: MailSplitLayout = {
  listDefault: 24,
  listMin: 20,
  listMax: 38,
  readerDefault: 76,
  readerMin: 50,
};

const COMPACT_READER_LAYOUT: MailSplitLayout = {
  listDefault: 38,
  listMin: 32,
  listMax: 48,
  readerDefault: 62,
  readerMin: 52,
};

export function getMailSplitLayout(readerOpen: boolean, compactDesktop: boolean): MailSplitLayout {
  if (!readerOpen) return LIST_ONLY_LAYOUT;
  return compactDesktop ? COMPACT_READER_LAYOUT : WIDE_READER_LAYOUT;
}

export function shouldFocusReaderWithWorkspace(
  readerOpen: boolean,
  workspaceOpen: boolean,
  compactWorkspace: boolean,
) {
  return readerOpen && workspaceOpen && compactWorkspace;
}

export const mailSplitAutoSaveId = (compactDesktop: boolean) =>
  compactDesktop ? 'mail-panel-layout:reader-compact-v2' : 'mail-panel-layout:reader-wide-v2';
