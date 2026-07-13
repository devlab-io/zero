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

import { logger } from '../../lib/logger';
import type { ZeroDriverInternal } from './internal';
import { desc, isNotNull } from 'drizzle-orm';
import { threads } from './db/schema';

export function parseMalformedSender(rawData: string): { email: string; name?: string } | null {
  const emailRegex = /([^\s@]+@[^\s@]+\.[^\s@]+)/;

  if (emailRegex.test(rawData.trim())) {
    const email = rawData.trim();
    logger.warn('[SuggestRecipients] Used fallback parsing for plain email:', email);
    return { email, name: undefined };
  }

  const emailMatch = rawData.match(emailRegex);
  if (!emailMatch) return null;

  const email = emailMatch[1];
  let name: string | undefined = undefined;

  const namePatterns = [
    /"name"\s*:\s*"([^"]+)"/,
    /'name'\s*:\s*'([^']+)'/,
    /name\s*:\s*([^,}\]]+)/,
    /"([^"]+)"\s*<[^>]*>/,
    /'([^']+)'\s*<[^>]*>/,
    /([^<]+)\s*<[^>]*>/,
    /"([^"]+)"/,
    /'([^']+)'/,
  ];

  for (const pattern of namePatterns) {
    const nameMatch = rawData.match(pattern);
    if (nameMatch && nameMatch[1]) {
      const potentialName = nameMatch[1].trim();
      if (potentialName && potentialName !== email && !potentialName.includes('@')) {
        name = potentialName.replace(/[{}[\],]/g, '').trim();
        if (name) break;
      }
    }
  }

  logger.warn('[SuggestRecipients] Extracted from malformed data:', { email, name });
  return { email, name };
}

export async function suggestRecipients(
  self: ZeroDriverInternal,
  query: string = '',
  limit: number = 10,
) {
  const lower = query.toLowerCase();

  const hashRows = await self.db
    .select({ id: threads.id })
    .from(threads)
    .where(isNotNull(threads.latestSender))
    .orderBy(desc(threads.latestReceivedOn))
    .limit(100);

  const currentHash = hashRows.map((r) => r.id).join(',');

  if (!self.recipientCache || self.recipientCache.hash !== currentHash) {
    const rows = await self.db
      .select({
        latest_sender: threads.latestSender,
        latest_received_on: threads.latestReceivedOn,
      })
      .from(threads)
      .where(isNotNull(threads.latestSender))
      .orderBy(desc(threads.latestReceivedOn))
      .limit(100);

    const map = new Map<
      string,
      { email: string; name?: string | null; freq: number; last: number }
    >();

    for (const row of rows) {
      if (!row?.latest_sender) continue;

      let sender: { email?: string; name?: string } | null = null;

      try {
        const senderData = row.latest_sender;
        if (typeof senderData === 'string') {
          sender = JSON.parse(senderData);
        } else if (typeof senderData === 'object' && senderData !== null) {
          sender = senderData as { email?: string; name?: string };
        } else {
          sender = parseMalformedSender(String(senderData));
        }

        if (!sender) {
          logger.error(
            '[SuggestRecipients] Failed to parse latest_sender, no fallback possible. Raw data:',
            row.latest_sender,
          );
          continue;
        }
      } catch (error) {
        sender = parseMalformedSender(String(row.latest_sender));
        if (!sender) {
          logger.error(
            '[SuggestRecipients] Failed to parse latest_sender, no fallback possible:',
            error,
            'Raw data:',
            row.latest_sender,
          );
          continue;
        }
      }

      if (!sender?.email) continue;

      const key = sender.email.toLowerCase();
      const lastTs = row.latest_received_on
        ? new Date(String(row.latest_received_on)).getTime()
        : 0;

      if (!map.has(key)) {
        map.set(key, {
          email: sender.email,
          name: sender.name || null,
          freq: 1,
          last: lastTs,
        });
      } else {
        const entry = map.get(key)!;
        entry.freq += 1;
        if (lastTs > entry.last) entry.last = lastTs;
      }
    }

    self.recipientCache = {
      contacts: Array.from(map.values()),
      hash: currentHash,
    };
  }

  let contacts = self.recipientCache.contacts.slice();

  if (lower) {
    contacts = contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(lower) || (c.name && c.name.toLowerCase().includes(lower)),
    );
  }

  contacts.sort((a, b) => b.freq - a.freq || b.last - a.last);

  return contacts.slice(0, limit).map((c) => ({
    email: c.email,
    name: c.name,
    displayText: c.name ? `${c.name} <${c.email}>` : c.email,
  }));
}
