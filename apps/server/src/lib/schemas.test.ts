import { describe, expect, it } from 'vitest';

import { defaultUserSettings, userSettingsSchema } from './schemas';

describe('direct draft send preference', () => {
  it('keeps the confirmation guard enabled when older settings omit it', () => {
    const { confirmDirectDraftSend: _omitted, ...legacySettings } = defaultUserSettings;

    expect(userSettingsSchema.parse(legacySettings).confirmDirectDraftSend).toBe(true);
  });

  it('allows an explicit opt-out without changing the other send safeguards', () => {
    const settings = userSettingsSchema.parse({
      ...defaultUserSettings,
      confirmDirectDraftSend: false,
      undoSendEnabled: true,
    });

    expect(settings.confirmDirectDraftSend).toBe(false);
    expect(settings.undoSendEnabled).toBe(true);
  });
});

describe('predictive writing preference', () => {
  it('defaults on for older settings and accepts an explicit opt-out', () => {
    const { predictiveWritingEnabled: _omitted, ...legacySettings } = defaultUserSettings;
    expect(userSettingsSchema.parse(legacySettings).predictiveWritingEnabled).toBe(true);
    expect(
      userSettingsSchema.parse({ ...defaultUserSettings, predictiveWritingEnabled: false })
        .predictiveWritingEnabled,
    ).toBe(false);
  });
});
