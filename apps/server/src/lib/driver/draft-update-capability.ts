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

export const CREATE_NEW_UNSENT_DRAFT_ADVICE =
  'Create a new unsent draft for human review instead of overwriting the existing draft.';

export type ProviderDraftUpdateCapability = {
  provider: string;
  supported: boolean;
  concurrencyControl: 'provider-native-atomic-cas' | 'unavailable';
  reason: string;
  recommendedAction: string;
};

export const unsupportedProviderDraftUpdate = (
  provider: string,
  reason = 'The provider exposes no proven conditional draft write tied to a provider revision token.',
): ProviderDraftUpdateCapability => ({
  provider,
  supported: false,
  concurrencyControl: 'unavailable',
  reason,
  recommendedAction: CREATE_NEW_UNSENT_DRAFT_ADVICE,
});

export const MCP_DRAFT_UPDATE_POLICY = {
  requiredConcurrencyControl: 'provider-native-atomic-cas',
  failClosed: true,
  fallback: CREATE_NEW_UNSENT_DRAFT_ADVICE,
  knownProviders: {
    google: { supported: false },
    microsoft: { supported: false },
  },
} as const;
