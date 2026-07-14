import { describe, expect, it } from 'vitest';

import {
  MOVE_DESTINATIONS,
  availableMoveDestinations,
  isLabelOnThread,
} from './label-move-picker.logic';

describe('availableMoveDestinations (v — move picker)', () => {
  it('offers every destination except the current folder', () => {
    expect(availableMoveDestinations('inbox').map((d) => d.id)).toEqual(['archive', 'spam', 'bin']);
    expect(availableMoveDestinations('archive').map((d) => d.id)).toEqual(['inbox', 'spam', 'bin']);
  });

  it('offers all destinations when the folder is not a move target (e.g. sent/drafts)', () => {
    expect(availableMoveDestinations('sent')).toEqual(MOVE_DESTINATIONS);
    expect(availableMoveDestinations(null)).toEqual(MOVE_DESTINATIONS);
    expect(availableMoveDestinations(undefined)).toEqual(MOVE_DESTINATIONS);
  });
});

describe('isLabelOnThread (l — label picker toggle state)', () => {
  it('is true only when the thread carries the label id', () => {
    const onThread = new Set(['Label_1', 'Label_2']);
    expect(isLabelOnThread(onThread, 'Label_1')).toBe(true);
    expect(isLabelOnThread(onThread, 'Label_3')).toBe(false);
    expect(isLabelOnThread(new Set<string>(), 'Label_1')).toBe(false);
  });
});
