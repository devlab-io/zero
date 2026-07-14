import { describe, expect, it } from 'vitest';
import {
  READ_RETRY_MAX,
  readRetryDelay,
  readRetryDelayCeiling,
  shouldRetryRead,
} from './query-retry';

// Issue #34, check point 4: reads retry at most twice with capped exponential
// jitter; non-idempotent mutations do not (mutations don't use this policy at all).

describe('shouldRetryRead', () => {
  it('retries transient failures up to the cap, then stops', () => {
    expect(shouldRetryRead(0, new Error('network'))).toBe(true);
    expect(shouldRetryRead(1, new Error('network'))).toBe(true);
    expect(shouldRetryRead(READ_RETRY_MAX, new Error('network'))).toBe(false);
    expect(shouldRetryRead(3, new Error('network'))).toBe(false);
  });

  it('never retries deterministic 4xx client errors', () => {
    for (const httpStatus of [400, 401, 403, 404, 422]) {
      expect(shouldRetryRead(0, { data: { httpStatus } })).toBe(false);
    }
  });

  it('retries 408/429 (transient throttling/timeouts) and 5xx', () => {
    expect(shouldRetryRead(0, { data: { httpStatus: 408 } })).toBe(true);
    expect(shouldRetryRead(0, { data: { httpStatus: 429 } })).toBe(true);
    expect(shouldRetryRead(0, { data: { httpStatus: 500 } })).toBe(true);
    expect(shouldRetryRead(0, { shape: { data: { httpStatus: 503 } } })).toBe(true);
  });

  it('caps retries even for retryable statuses', () => {
    expect(shouldRetryRead(READ_RETRY_MAX, { data: { httpStatus: 500 } })).toBe(false);
  });
});

describe('readRetryDelay', () => {
  it('never exceeds the per-attempt exponential ceiling (capped + jittered)', () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = readRetryDelayCeiling(attempt);
      for (let sample = 0; sample < 200; sample++) {
        const delay = readRetryDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(ceiling);
        expect(delay).toBeLessThanOrEqual(30_000); // hard cap
      }
    }
  });

  it('has a non-decreasing exponential ceiling that saturates at the cap', () => {
    let previous = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = readRetryDelayCeiling(attempt);
      expect(ceiling).toBeGreaterThanOrEqual(previous);
      previous = ceiling;
    }
    expect(readRetryDelayCeiling(20)).toBe(30_000);
  });
});
