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

// Entry point / re-export barrel for the agent Durable Objects (issue #22 split).
// The three DO classes and the Effect error/result surface were extracted into
// cohesive modules; this barrel preserves the module's public export contract
// (main.ts and env.ts import the classes from here — surface unchanged).

export * from './errors';
export { ShardRegistry } from './shard-registry';
export { ZeroAgent } from './chat-agent';
export { ZeroDriver } from './zero-driver';
