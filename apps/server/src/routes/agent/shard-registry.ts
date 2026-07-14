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

import { Migratable, Queryable } from 'dormroom';
import { DurableObject } from 'cloudflare:workers';
import { type ZeroEnv } from '../../env';

@Migratable({
  migrations: {
    1: [
      `CREATE TABLE IF NOT EXISTS shards (
      shard_id TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    ],
  },
})
@Queryable()
export class ShardRegistry extends DurableObject<ZeroEnv> {
  sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: ZeroEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }
}
