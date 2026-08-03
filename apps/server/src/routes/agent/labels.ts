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

import { getThreadLabels, modifyThreadLabels } from './db';
import type { ZeroDriverInternal } from './internal';
import { OutgoingMessageType } from './types';
import { logger } from '../../lib/logger';

export async function modifyThreadLabelsByName(
  self: ZeroDriverInternal,
  threadId: string,
  addLabelNames: string[],
  removeLabelNames: string[],
) {
  try {
    if (!self.driver) {
      throw new Error('No driver available');
    }

    // Get all user labels to map names to IDs
    const userLabels = await self.getUserLabels();
    const labelMap = new Map(userLabels.map((label) => [label.name.toLowerCase(), label.id]));

    // Convert label names to IDs
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    // Process add labels
    for (const labelName of addLabelNames) {
      const labelId = labelMap.get(labelName.toLowerCase());
      if (labelId) {
        addLabelIds.push(labelId);
      } else {
        logger.warn(`Label "${labelName}" not found in user labels`);
      }
    }

    // Process remove labels
    for (const labelName of removeLabelNames) {
      const labelId = labelMap.get(labelName.toLowerCase());
      if (labelId) {
        removeLabelIds.push(labelId);
      } else {
        logger.warn(`Label "${labelName}" not found in user labels`);
      }
    }

    // Call the existing function with IDs
    return await modifyThreadLabelsInDB(self, threadId, addLabelIds, removeLabelIds);
  } catch (error) {
    logger.error('Failed to modify thread labels by name:', error);
    throw error;
  }
}

export async function modifyThreadLabelsInDB(
  self: ZeroDriverInternal,
  threadId: string,
  addLabels: string[],
  removeLabels: string[],
) {
  try {
    const currentLabelsData = await getThreadLabels(self.db, threadId);
    const currentLabels = currentLabelsData.map((l) => l.id);

    const result = await modifyThreadLabels(self.db, threadId, addLabels, removeLabels);

    if (!result.threadFound) {
      logger.warn('[labels] Skipped local label mutation because the thread is not synced', {
        threadIdLength: threadId.length,
        addCount: addLabels.length,
        removeCount: removeLabels.length,
      });

      return {
        success: false,
        threadId,
        previousLabels: currentLabels,
        addedLabels: [],
        removedLabels: [],
        skipped: 'thread_not_found' as const,
      };
    }

    const allAffectedLabels = [...new Set([...addLabels, ...removeLabels])];
    await Promise.all(allAffectedLabels.map((label) => self.reloadFolder(label.toLowerCase())));

    await self.agent?.broadcastChatMessage({
      type: OutgoingMessageType.Mail_Get,
      threadId,
    });

    return {
      success: true,
      threadId,
      previousLabels: currentLabels,
      addedLabels: result.addedLabels,
      removedLabels: result.removedLabels,
    };
  } catch (error) {
    logger.error('Failed to modify thread labels in database:', error);
    throw error;
  }
}
