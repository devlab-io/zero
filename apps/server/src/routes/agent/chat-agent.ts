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
import { invariant } from '../../lib/invariant';
import {
  appendResponseMessages,
  createDataStreamResponse,
  streamText,
  type Message,
  type StreamTextOnFinishCallback,
} from 'ai';
import {
  IncomingMessageType,
  OutgoingMessageType,
  type IncomingMessage,
  type OutgoingMessage,
} from './types';
import { DurableObjectOAuthClientProvider } from 'agents/mcp/do-oauth-client-provider';
import { AiChatPrompt } from '../../lib/prompts';
import { reSyncThread } from '../../lib/server-utils';
import { getPrompt } from '../../pipelines.effect';
import { AIChatAgent } from 'agents/ai-chat-agent';
import { ToolOrchestrator } from './orchestrator';
import { getPromptName } from '../../pipelines';
import { anthropic } from '@ai-sdk/anthropic';
import type { WSMessage } from 'partyserver';
import { tools as authTools } from './tools';
import { processToolCalls } from './utils';
import { type ZeroEnv } from '../../env';
import { type Connection } from 'agents';
import { EPrompts } from '../../types';
import { groq } from '@ai-sdk/groq';

const decoder = new TextDecoder();

export class ZeroAgent extends AIChatAgent<ZeroEnv> {
  private chatMessageAbortControllers: Map<string, AbortController> = new Map();

  async registerZeroMCP() {
    await this.mcp.connect(this.env.VITE_PUBLIC_BACKEND_URL + '/sse', {
      transport: {
        authProvider: new DurableObjectOAuthClientProvider(
          this.ctx.storage,
          'zero-mcp',
          this.env.VITE_PUBLIC_BACKEND_URL,
        ),
      },
    });
  }

  async registerThinkingMCP() {
    await this.mcp.connect(this.env.VITE_PUBLIC_BACKEND_URL + '/mcp/thinking/sse', {
      transport: {
        authProvider: new DurableObjectOAuthClientProvider(
          this.ctx.storage,
          'thinking-mcp',
          this.env.VITE_PUBLIC_BACKEND_URL,
        ),
      },
    });
  }

  onStart() {
    this.registerThinkingMCP();
  }

  async onConnect(connection: Connection): Promise<void> {
    connection.send(
      JSON.stringify({
        type: OutgoingMessageType.Mail_List,
        folder: 'inbox',
      }),
    );
  }

  async _reSyncThread({ threadId }: { threadId: string }) {
    await reSyncThread(this.name, threadId);
  }

  private getDataStreamResponse(
    onFinish: StreamTextOnFinishCallback<{}>,
    currentThreadId: string,
    currentFolder: string,
    currentFilter: string,
  ) {
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        if (this.name === 'general') return;
        const connectionId = this.name;
        const orchestrator = new ToolOrchestrator(dataStream, connectionId);

        const mcpTools = this.mcp.unstable_getAITools();

        const rawTools = {
          ...(await authTools(connectionId)),
          ...mcpTools,
        };

        const tools = orchestrator.processTools(rawTools);
        const processedMessages = await processToolCalls(
          {
            messages: this.messages,
            dataStream,
            tools,
          },
          {},
        );

        const model =
          this.env.USE_OPENAI === 'true'
            ? groq('openai/gpt-oss-120b')
            : anthropic(this.env.OPENAI_MODEL || 'claude-3-7-sonnet-20250219');

        const result = streamText({
          model,
          maxSteps: 10,
          messages: processedMessages,
          tools,
          onFinish,
          onError: (error) => {
            logger.error('Error in streamText', error);
          },
          system: await getPrompt(getPromptName(connectionId, EPrompts.Chat), AiChatPrompt(), {
            currentThreadId,
            currentFolder,
            currentFilter,
          }),
        });

        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }

  private async tryCatchChat<T>(fn: () => T | Promise<T>) {
    try {
      return await fn();
    } catch (e) {
      throw this.onError(e);
    }
  }

  private getAbortSignal(id: string): AbortSignal | undefined {
    // Defensive check, since we're coercing message types at the moment
    if (typeof id !== 'string') {
      return undefined;
    }

    if (!this.chatMessageAbortControllers.has(id)) {
      this.chatMessageAbortControllers.set(id, new AbortController());
    }

    return this.chatMessageAbortControllers.get(id)?.signal;
  }

  /**
   * Remove an abort controller from the cache of pending message responses
   */
  private removeAbortController(id: string) {
    this.chatMessageAbortControllers.delete(id);
  }

  broadcastChatMessage(message: OutgoingMessage, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  private cancelChatRequest(id: string) {
    if (this.chatMessageAbortControllers.has(id)) {
      const abortController = this.chatMessageAbortControllers.get(id);
      abortController?.abort();
    }
  }

  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message === 'string') {
      let data: IncomingMessage;
      try {
        data = JSON.parse(message) as IncomingMessage;
      } catch (error) {
        logger.warn(error);
        // silently ignore invalid messages for now
        // TODO: log errors with log levels
        return;
      }
      switch (data.type) {
        case IncomingMessageType.UseChatRequest: {
          if (data.init.method !== 'POST') break;

          const { body } = data.init;

          const { messages, threadId, currentFolder, currentFilter } = JSON.parse(
            body as string,
          ) as {
            threadId: string;
            currentFolder: string;
            currentFilter: string;
            messages: Message[];
          };
          this.broadcastChatMessage(
            {
              type: OutgoingMessageType.ChatMessages,
              messages,
            },
            [connection.id],
          );
          await this.persistMessages(messages, [connection.id]);

          const chatMessageId = data.id;
          //   const abortSignal = this.getAbortSignal(chatMessageId);

          return this.tryCatchChat(async () => {
            const response = await this.onChatMessageWithContext(
              async ({ response }) => {
                const finalMessages = appendResponseMessages({
                  messages,
                  responseMessages: response.messages,
                });

                await this.persistMessages(finalMessages, [connection.id]);
                this.removeAbortController(chatMessageId);
              },
              threadId,
              currentFolder,
              currentFilter,
            );

            if (response) {
              await this.reply(data.id, response);
            } else {
              logger.warn(
                `[AIChatAgent] onChatMessage returned no response for chatMessageId: ${chatMessageId}`,
              );
              this.broadcastChatMessage(
                {
                  id: data.id,
                  type: OutgoingMessageType.UseChatResponse,
                  body: 'No response was generated by the agent.',
                  done: true,
                },
                [connection.id],
              );
            }
          });
        }
        case IncomingMessageType.ChatClear: {
          this.destroyAbortControllers();
          void this.sql`delete from cf_ai_chat_agent_messages`;
          this.messages = [];
          this.broadcastChatMessage(
            {
              type: OutgoingMessageType.ChatClear,
            },
            [connection.id],
          );
          break;
        }
        case IncomingMessageType.ChatMessages: {
          await this.persistMessages(data.messages, [connection.id]);
          break;
        }
        case IncomingMessageType.ChatRequestCancel: {
          this.cancelChatRequest(data.id);
          break;
        }
        // case IncomingMessageType.Mail_List: {
        //   const result = await this.getThreadsFromDB({
        //     labelIds: data.labelIds,
        //     folder: data.folder,
        //     q: data.query,
        //     max: data.maxResults,
        //     cursor: data.pageToken,
        //   });
        //   this.currentFolder = data.folder;
        //   connection.send(
        //     JSON.stringify({
        //       type: OutgoingMessageType.Mail_List,
        //       result,
        //     }),
        //   );
        //   break;
        // }
        // case IncomingMessageType.Mail_Get: {
        //   const result = await this.getThreadFromDB(data.threadId);
        //   connection.send(
        //     JSON.stringify({
        //       type: OutgoingMessageType.Mail_Get,
        //       result,
        //       threadId: data.threadId,
        //     }),
        //   );
        //   break;
        // }
      }
    }
  }

  private async reply(id: string, response: Response) {
    // now take chunks out from dataStreamResponse and send them to the client
    return this.tryCatchChat(async () => {
      const body = response.body;
      invariant(body, 'response has no body');
      for await (const chunk of body) {
        const body = decoder.decode(chunk);

        this.broadcastChatMessage({
          id,
          type: OutgoingMessageType.UseChatResponse,
          body,
          done: false,
        });
      }

      this.broadcastChatMessage({
        id,
        type: OutgoingMessageType.UseChatResponse,
        body: '',
        done: true,
      });
    });
  }

  private destroyAbortControllers() {
    for (const controller of this.chatMessageAbortControllers.values()) {
      controller?.abort();
    }
    this.chatMessageAbortControllers.clear();
  }

  async getCachedDoState(): Promise<{
    storageSize: number;
    counts: { label: string; count: number }[];
    shards: number;
    timestamp: number;
  } | null> {
    try {
      const cached = await this.ctx.storage.get('do_state_cache');
      if (!cached) return null;

      const data = cached as { storageSize: number; counts: { label: string; count: number }[]; shards: number; timestamp: number };
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000;

      if (now - data.timestamp > CACHE_TTL) {
        await this.ctx.storage.delete('do_state_cache');
        return null;
      }

      return data;
    } catch (error) {
      logger.error('[ZeroAgent] Failed to get cached DO state:', error);
      return null;
    }
  }

  async setCachedDoState(
    storageSize: number,
    counts: { label: string; count: number }[],
    shards: number,
  ): Promise<void> {
    try {
      const data = {
        storageSize,
        counts,
        shards,
        timestamp: Date.now(),
      };
      await this.ctx.storage.put('do_state_cache', data);
    } catch (error) {
      logger.error('[ZeroAgent] Failed to cache DO state:', error);
    }
  }

  async invalidateDoStateCache(): Promise<void> {
    try {
      await this.ctx.storage.delete('do_state_cache');
    } catch (error) {
      logger.error('[ZeroAgent] Failed to invalidate DO state cache:', error);
    }
  }

  async onChatMessageWithContext(
    onFinish: StreamTextOnFinishCallback<{}>,
    currentThreadId: string,
    currentFolder: string,
    currentFilter: string,
  ) {
    return this.getDataStreamResponse(onFinish, currentThreadId, currentFolder, currentFilter);
  }
}
