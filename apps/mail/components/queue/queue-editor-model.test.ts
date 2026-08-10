import { describe, expect, it } from 'vitest';

import {
  draftSignature,
  isLegacyWorkerRuntimeError,
  normalizeEditableAddresses,
  parseEditableAddressList,
} from './queue-editor-model';

describe('queue editor model', () => {
  it('normalizes provider address wrappers before an autosave', () => {
    expect(
      normalizeEditableAddresses(['<alan@devlab.io>', 'Alan <alan@devlab.io>', ' hugo@devlab.io ']),
    ).toEqual(['alan@devlab.io', 'hugo@devlab.io']);
    expect(parseEditableAddressList('<alan@devlab.io>, Hugo <hugo@devlab.io>')).toEqual([
      'alan@devlab.io',
      'hugo@devlab.io',
    ]);
  });

  it('uses the normalized editable content to detect unsaved changes', () => {
    const wrapped = {
      to: ['<alan@devlab.io>'],
      cc: [],
      bcc: [],
      subject: 'Objet',
      body: '<p>Bonjour</p>',
    };
    expect(draftSignature(wrapped)).toBe(draftSignature({ ...wrapped, to: ['alan@devlab.io'] }));
    expect(draftSignature(wrapped)).not.toBe(
      draftSignature({ ...wrapped, body: '<p>Bonjour Alan</p>' }),
    );
  });

  it('recognizes the legacy launchd runtime failure without hiding other errors', () => {
    expect(
      isLegacyWorkerRuntimeError('Codex a quitté avec le code 127: env: node: No such file'),
    ).toBe(true);
    expect(isLegacyWorkerRuntimeError('RETA provider draft write failed')).toBe(false);
  });
});
