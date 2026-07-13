/*
 * Licensed to Zero Email Inc. under one or more contributor license agreements.
 * You may not use this file except in compliance with the Apache License, Version 2.0 (the "License").
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Reuse or distribution of this file requires a license from Zero Email Inc.
 */

import {
  TOPIC_CACHE_KEY,
  TOPIC_CACHE_TTL,
  type CachedTopics,
  type TopicGenerationResult,
} from './errors';
import { generateWhatUserCaresAbout, type UserTopic } from '../../lib/analyze/interests';
import type { ZeroDriverInternal } from './internal';
import { OutgoingMessageType } from './types';
import { Effect } from 'effect';

export function getUserTopics(self: ZeroDriverInternal): Promise<UserTopic[]> {
  // Create the Effect with proper types - no external requirements needed
  const topicGenerationEffect = Effect.gen(self, function* () {
    console.log(`[getUserTopics] Starting topic generation for connection: ${this.name}`);

    const result: TopicGenerationResult = {
      topics: [],
      cacheHit: false,
      subjectsAnalyzed: 0,
      existingLabelsCount: 0,
      labelsCreated: 0,
      broadcastSent: false,
    };

    // Check storage first
    const stored = yield* Effect.tryPromise(() => this.ctx.storage.get(TOPIC_CACHE_KEY)).pipe(
      Effect.tap(() =>
        Effect.sync(() => console.log(`[getUserTopics] Checking storage for cached topics`)),
      ),
      Effect.catchAll((error) => {
        console.warn(`[getUserTopics] Failed to get cached topics from storage:`, error);
        return Effect.succeed(null);
      }),
    );

    if (stored) {
      // Type guard to ensure stored is a valid CachedTopics object
      const isValidCachedTopics = (data: unknown): data is CachedTopics => {
        return (
          typeof data === 'object' &&
          data !== null &&
          'topics' in data &&
          'timestamp' in data &&
          Array.isArray((data as Record<string, unknown>).topics) &&
          typeof (data as Record<string, unknown>).timestamp === 'number'
        );
      };

      const cachedTopicsResult = yield* Effect.try({
        try: () => {
          if (!isValidCachedTopics(stored)) {
            throw new Error('Invalid cached data format');
          }
          return stored as CachedTopics;
        },
        catch: (error) => new Error(`Invalid cached data: ${error}`),
      }).pipe(
        Effect.catchAll((error) => {
          console.warn(`[getUserTopics] Invalid cached data, regenerating:`, error);
          return Effect.succeed(null);
        }),
      );

      if (cachedTopicsResult) {
        const cacheAge = Date.now() - cachedTopicsResult.timestamp;

        if (cacheAge < TOPIC_CACHE_TTL) {
          console.log(
            `[getUserTopics] Using cached topics (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`,
          );
          result.topics = cachedTopicsResult.topics;
          result.cacheHit = true;
          result.cacheAge = cacheAge;
          return result;
        } else {
          console.log(
            `[getUserTopics] Cache expired (age: ${Math.round(cacheAge / 1000 / 60)} minutes), regenerating`,
          );
        }
      }
    }

    // Generate new topics
    console.log(`[getUserTopics] Generating new topics`);
    const subjects = yield* Effect.tryPromise(() => this.getAllSubjects()).pipe(
      Effect.catchAll((error) => {
        console.error(`[getUserTopics] Failed to get subjects:`, error);
        return Effect.succeed([]);
      }),
    );
    result.subjectsAnalyzed = subjects.length;
    console.log(`[getUserTopics] Found ${subjects.length} subjects for analysis`);

    let existingLabels: { name: string; id: string }[] = [];

    const existingLabelsResult = yield* Effect.tryPromise(() => this.getUserLabels()).pipe(
      Effect.tap((labels) =>
        Effect.sync(() => {
          result.existingLabelsCount = labels.length;
          console.log(`[getUserTopics] Retrieved ${labels.length} existing labels`);
        }),
      ),
      Effect.catchAll((error) => {
        console.warn(
          `[getUserTopics] Failed to get existing labels for topic generation:`,
          error,
        );
        return Effect.succeed([]);
      }),
    );

    existingLabels = existingLabelsResult;

    const topics = yield* Effect.tryPromise(() =>
      generateWhatUserCaresAbout(subjects, { existingLabels }),
    ).pipe(
      Effect.tap((topics) =>
        Effect.sync(() => {
          result.topics = topics;
          console.log(
            `[getUserTopics] Generated ${topics.length} topics:`,
            topics.map((t) => t.topic),
          );
        }),
      ),
      Effect.catchAll((error) => {
        console.error(`[getUserTopics] Failed to generate topics:`, error);
        return Effect.succeed([]);
      }),
    );

    if (topics.length > 0) {
      console.log(`[getUserTopics] Processing ${topics.length} topics`);

      // Ensure labels exist in user account
      yield* Effect.tryPromise(async () => {
        try {
          const existingLabelNames = new Set(
            existingLabels.map((label) => label.name.toLowerCase()),
          );
          let createdCount = 0;

          for (const topic of topics) {
            const topicName = topic.topic.toLowerCase();
            if (!existingLabelNames.has(topicName)) {
              console.log(`[getUserTopics] Creating label for topic: ${topic.topic}`);
              await this.createLabel({
                name: topic.topic,
              });
              createdCount++;
            }
          }
          result.labelsCreated = createdCount;
          console.log(`[getUserTopics] Created ${createdCount} new labels`);
        } catch (error) {
          console.error(`[getUserTopics] Failed to ensure topic labels exist:`, error);
          throw error;
        }
      }).pipe(
        Effect.catchAll((error) => {
          console.error(`[getUserTopics] Error creating labels:`, error);
          return Effect.succeed(undefined);
        }),
      );

      // Store the result
      yield* Effect.tryPromise(() =>
        this.ctx.storage.put(TOPIC_CACHE_KEY, {
          topics,
          timestamp: Date.now(),
        }),
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => console.log(`[getUserTopics] Stored topics in cache`)),
        ),
        Effect.catchAll((error) => {
          console.error(`[getUserTopics] Failed to store topics in cache:`, error);
          return Effect.succeed(undefined);
        }),
      );

      // Broadcast message if agent exists
      if (this.agent) {
        yield* Effect.tryPromise(() =>
          this.agent!.broadcastChatMessage({
            type: OutgoingMessageType.User_Topics,
          }),
        ).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              result.broadcastSent = true;
              console.log(`[getUserTopics] Broadcasted topics update`);
            }),
          ),
          Effect.catchAll((error) => {
            console.warn(`[getUserTopics] Failed to broadcast topics update:`, error);
            return Effect.succeed(undefined);
          }),
        );
      } else {
        console.log(`[getUserTopics] No agent available for broadcasting`);
      }
    } else {
      console.log(`[getUserTopics] No topics generated`);
    }

    console.log(`[getUserTopics] Completed topic generation for connection: ${this.name}`, {
      topicsCount: result.topics.length,
      cacheHit: result.cacheHit,
      subjectsAnalyzed: result.subjectsAnalyzed,
      existingLabelsCount: result.existingLabelsCount,
      labelsCreated: result.labelsCreated,
      broadcastSent: result.broadcastSent,
    });

    return result;
  });

  // Run the Effect and extract just the topics for backward compatibility
  return Effect.runPromise(
    topicGenerationEffect.pipe(
      Effect.map((result) => result.topics),
      Effect.catchAll((error) => {
        console.error(`[getUserTopics] Critical error in getUserTopics:`, error);
        return Effect.succeed([]);
      }),
    ),
  );
}
