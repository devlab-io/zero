import { describe, expect, it } from 'vitest';

import { deriveReplyRecipients, deriveReplySubject } from './reply-recipients';
import type { Sender } from '@/types';

const s = (email: string, name?: string): Sender => ({ email, name });

const USER = 'me@example.com';

describe('deriveReplyRecipients', () => {
  describe('reply', () => {
    it('replies to the sender when the sender is not the current user', () => {
      const result = deriveReplyRecipients({
        mode: 'reply',
        userEmail: USER,
        message: { sender: s('alice@example.com'), to: [s(USER)], cc: null },
      });
      expect(result).toEqual({ to: ['alice@example.com'], cc: [] });
    });

    it('replies to the first To recipient when replying to our own email', () => {
      const result = deriveReplyRecipients({
        mode: 'reply',
        userEmail: USER,
        message: { sender: s(USER), to: [s('bob@example.com'), s('carol@example.com')], cc: null },
      });
      expect(result).toEqual({ to: ['bob@example.com'], cc: [] });
    });

    it('yields no recipients when replying to our own email with no To recipients', () => {
      const result = deriveReplyRecipients({
        mode: 'reply',
        userEmail: USER,
        message: { sender: s(USER), to: [], cc: null },
      });
      expect(result).toEqual({ to: [], cc: [] });
    });

    it('compares case-insensitively but preserves the original-case address', () => {
      const result = deriveReplyRecipients({
        mode: 'reply',
        userEmail: 'ME@example.com',
        message: { sender: s('Alice@Example.com'), to: [], cc: null },
      });
      expect(result).toEqual({ to: ['Alice@Example.com'], cc: [] });
    });
  });

  describe('replyAll', () => {
    it('adds the sender plus other To recipients, excluding the user and the sender', () => {
      const result = deriveReplyRecipients({
        mode: 'replyAll',
        userEmail: USER,
        message: {
          sender: s('alice@example.com'),
          to: [s(USER), s('alice@example.com'), s('dave@example.com')],
          cc: null,
        },
      });
      expect(result).toEqual({ to: ['alice@example.com', 'dave@example.com'], cc: [] });
    });

    it('adds CC recipients not already present in To, excluding the user', () => {
      const result = deriveReplyRecipients({
        mode: 'replyAll',
        userEmail: USER,
        message: {
          sender: s('alice@example.com'),
          to: [s('dave@example.com')],
          cc: [s(USER), s('erin@example.com'), s('dave@example.com')],
        },
      });
      // erin is added to cc; dave already in to (exact match) is skipped; user skipped.
      expect(result).toEqual({
        to: ['alice@example.com', 'dave@example.com'],
        cc: ['erin@example.com'],
      });
    });

    it('does not add the sender when the sender is the current user', () => {
      const result = deriveReplyRecipients({
        mode: 'replyAll',
        userEmail: USER,
        message: { sender: s(USER), to: [s('frank@example.com')], cc: null },
      });
      expect(result).toEqual({ to: ['frank@example.com'], cc: [] });
    });
  });

  it('excludes every owned identity and deduplicates To and Cc case-insensitively', () => {
    const result = deriveReplyRecipients({
      mode: 'replyAll',
      userEmail: USER,
      ownedEmails: ['alias@example.com'],
      message: {
        sender: s('Alice@Example.com'),
        to: [s('alice@example.com'), s('ALIAS@example.com'), s('Bob@Example.com')],
        cc: [s('bob@example.com'), s('Carol@Example.com'), s('CAROL@example.com')],
      },
    });
    expect(result).toEqual({
      to: ['Alice@Example.com', 'Bob@Example.com'],
      cc: ['Carol@Example.com'],
    });
  });

  describe('forward and edge cases', () => {
    it('returns empty recipients for forward', () => {
      const result = deriveReplyRecipients({
        mode: 'forward',
        userEmail: USER,
        message: {
          sender: s('alice@example.com'),
          to: [s('bob@example.com')],
          cc: [s('carol@example.com')],
        },
      });
      expect(result).toEqual({ to: [], cc: [] });
    });

    it('returns empty recipients for an unknown mode', () => {
      const result = deriveReplyRecipients({
        mode: 'draft',
        userEmail: USER,
        message: { sender: s('alice@example.com'), to: [], cc: null },
      });
      expect(result).toEqual({ to: [], cc: [] });
    });

    it('returns empty recipients when userEmail is missing', () => {
      const result = deriveReplyRecipients({
        mode: 'reply',
        userEmail: '',
        message: { sender: s('alice@example.com'), to: [], cc: null },
      });
      expect(result).toEqual({ to: [], cc: [] });
    });
  });
});

describe('deriveReplySubject', () => {
  it('prefixes Re: for reply', () => {
    expect(deriveReplySubject({ mode: 'reply', subject: 'Lunch on Friday' })).toBe(
      'Re: Lunch on Friday',
    );
  });

  it('prefixes Re: for reply-all', () => {
    expect(deriveReplySubject({ mode: 'replyAll', subject: 'Lunch on Friday' })).toBe(
      'Re: Lunch on Friday',
    );
  });

  it('prefixes Fwd: for forward', () => {
    expect(deriveReplySubject({ mode: 'forward', subject: 'Lunch on Friday' })).toBe(
      'Fwd: Lunch on Friday',
    );
  });

  it('is idempotent when the subject is already an Re: prefix (any case)', () => {
    expect(deriveReplySubject({ mode: 'reply', subject: 'RE: Lunch on Friday' })).toBe(
      'RE: Lunch on Friday',
    );
    expect(deriveReplySubject({ mode: 'replyAll', subject: 're: Lunch' })).toBe('re: Lunch');
  });

  it('keeps an existing Fwd: prefix rather than stacking a Re:', () => {
    expect(deriveReplySubject({ mode: 'reply', subject: 'Fwd: Deck' })).toBe('Fwd: Deck');
  });

  it('trims and prefixes an empty or missing subject to the bare prefix', () => {
    expect(deriveReplySubject({ mode: 'reply', subject: '' })).toBe('Re:');
    expect(deriveReplySubject({ mode: 'reply', subject: null })).toBe('Re:');
    expect(deriveReplySubject({ mode: 'reply', subject: undefined })).toBe('Re:');
    expect(deriveReplySubject({ mode: 'forward', subject: '   ' })).toBe('Fwd:');
  });

  it('leaves the subject untouched for an unknown mode', () => {
    expect(deriveReplySubject({ mode: 'draft', subject: 'Lunch on Friday' })).toBe(
      'Lunch on Friday',
    );
  });
});
