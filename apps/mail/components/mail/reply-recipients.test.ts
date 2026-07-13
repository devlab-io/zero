import { describe, expect, it } from 'vitest';

import { deriveReplyRecipients } from './reply-recipients';
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
      expect(result).toEqual({ to: ['alice@example.com', 'dave@example.com'], cc: ['erin@example.com'] });
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

  describe('forward and edge cases', () => {
    it('returns empty recipients for forward', () => {
      const result = deriveReplyRecipients({
        mode: 'forward',
        userEmail: USER,
        message: { sender: s('alice@example.com'), to: [s('bob@example.com')], cc: [s('carol@example.com')] },
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
