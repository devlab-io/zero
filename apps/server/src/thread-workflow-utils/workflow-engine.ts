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

import type { IGetThreadResponse } from '../lib/driver/types';
import { workflowFunctions } from './workflow-functions';
import { shouldGenerateDraft } from './index';
import { initTracing } from '../lib/tracing';
import { connection } from '../db/schema';
import { logger } from '../lib/logger';

export type WorkflowContext = {
  connectionId: string;
  threadId: string;
  thread: IGetThreadResponse;
  foundConnection: typeof connection.$inferSelect;
  results?: Map<string, unknown>;
  env?: unknown;
  /**
   * Origine de l'exécution. Absent ou 'automatic' = pipeline d'arrivée de
   * message (Pub/Sub) ; 'user' = action explicite. Le résumé IA n'est produit
   * QUE sur action utilisateur (parité Shortwave sans IA).
   */
  trigger?: 'automatic' | 'user';
};

/** Condition des steps IA opt-in : jamais exécutés par le pipeline automatique. */
export const isUserTriggered = (context: WorkflowContext): boolean => context.trigger === 'user';

export type WorkflowStep = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition?: (context: WorkflowContext) => boolean | Promise<boolean>;
  action: (context: WorkflowContext) => Promise<unknown>;
  errorHandling?: 'continue' | 'fail';
  maxRetries?: number;
};

export type WorkflowDefinition = {
  name: string;
  description: string;
  steps: WorkflowStep[];
};

export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  registerWorkflow(workflow: WorkflowDefinition) {
    this.workflows.set(workflow.name, workflow);
  }

  getWorkflowNames(): string[] {
    return Array.from(this.workflows.keys());
  }

  async executeWorkflow(
    workflowName: string,
    context: WorkflowContext,
    existingResults?: Map<string, unknown>,
  ): Promise<{ results: Map<string, unknown>; errors: Map<string, Error> }> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow "${workflowName}" not found`);
    }

    const tracer = initTracing();
    const workflowSpan = tracer.startSpan('workflow_execution', {
      attributes: {
        'workflow.name': workflowName,
        'connection.id': context.connectionId,
        'thread.id': context.threadId,
      },
    });

    const results = new Map<string, unknown>(existingResults || []);
    const errors = new Map<string, Error>();

    try {
      for (const step of workflow.steps) {
        if (!step.enabled) {
          logger.info(`[WORKFLOW_ENGINE] Skipping disabled step: ${step.name}`);
          continue;
        }

        const stepSpan = tracer.startSpan('workflow_step', {
          attributes: {
            'step.id': step.id,
            'step.name': step.name,
            'step.enabled': step.enabled,
            'workflow.name': workflowName,
          },
        });

        try {
          const shouldExecute = step.condition
            ? await step.condition({ ...context, results })
            : true;
          if (!shouldExecute) {
            logger.info(`[WORKFLOW_ENGINE] Condition not met for step: ${step.name}`);
            stepSpan.setAttributes({ 'step.condition_met': false });
            stepSpan.end();
            break;
          }

          stepSpan.setAttributes({ 'step.condition_met': true });
          logger.info(`[WORKFLOW_ENGINE] Executing step: ${step.name}`);
          const result = await step.action({ ...context, results });
          results.set(step.id, result);
          logger.info(`[WORKFLOW_ENGINE] Completed step: ${step.name}`, result);
          stepSpan.setAttributes({ 'step.success': true });
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          logger.error(`[WORKFLOW_ENGINE] Error in step ${step.name}:`, errorObj);

          stepSpan.recordException(errorObj);
          stepSpan.setStatus({ code: 2, message: errorObj.message });

          if (step.errorHandling === 'fail') {
            stepSpan.end();
            throw errorObj;
          } else {
            errors.set(step.id, errorObj);
          }
        } finally {
          stepSpan.end();
        }
      }

      workflowSpan.setAttributes({
        'workflow.steps_completed': results.size,
        'workflow.errors_count': errors.size,
      });
    } finally {
      workflowSpan.end();
    }

    return { results, errors };
  }

  async executeWorkflowChain(
    workflowNames: string[],
    context: WorkflowContext,
  ): Promise<{ results: Map<string, unknown>; errors: Map<string, Error> }> {
    const sharedResults = new Map<string, unknown>();
    const allErrors = new Map<string, Error>();

    for (const workflowName of workflowNames) {
      logger.info(`[WORKFLOW_ENGINE] Executing workflow in chain: ${workflowName}`);
      try {
        const { results, errors } = await this.executeWorkflow(
          workflowName,
          context,
          sharedResults,
        );

        // Merge results
        for (const [key, value] of results) {
          sharedResults.set(key, value);
        }

        // Merge errors
        for (const [key, error] of errors) {
          allErrors.set(key, error);
        }

        logger.info(
          `[WORKFLOW_ENGINE] Completed workflow: ${workflowName}, total results: ${sharedResults.size}`,
        );
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logger.error(`[WORKFLOW_ENGINE] Failed to execute workflow ${workflowName}:`, errorObj);
        allErrors.set(workflowName, errorObj);
      }
    }

    return { results: sharedResults, errors: allErrors };
  }

  clearContext(context: WorkflowContext): void {
    if (context.results) {
      context.results.clear();
    }
    logger.info('[WORKFLOW_ENGINE] Context cleared');
  }
}

export const createDefaultWorkflows = (): WorkflowEngine => {
  const engine = new WorkflowEngine();

  const autoDraftWorkflow: WorkflowDefinition = {
    name: 'auto-draft-generation',
    description: 'Automatically generates drafts for threads that require responses',
    steps: [
      {
        id: 'check-draft-eligibility',
        name: 'Check Draft Eligibility',
        description: 'Determines if a draft should be generated for this thread',
        enabled: true,
        errorHandling: 'fail',
        condition: async (context) => {
          if (!isUserTriggered(context)) return false;
          const shouldGenerate = await shouldGenerateDraft(context.thread, context.foundConnection);
          logger.info('[WORKFLOW_ENGINE] Draft eligibility check', {
            threadId: context.threadId,
            connectionId: context.connectionId,
            shouldGenerate,
          });
          return shouldGenerate;
        },
        action: async (context) => {
          return context;
        },
      },
      {
        id: 'analyze-email-intent',
        name: 'Analyze Email Intent',
        description: 'Analyzes the intent of the latest email in the thread',
        enabled: true,
        action: workflowFunctions.analyzeEmailIntent,
      },
      {
        id: 'validate-response-needed',
        name: 'Validate Response Needed',
        description: 'Checks if the email requires a response based on intent analysis',
        enabled: true,
        action: workflowFunctions.validateResponseNeeded,
      },
      {
        id: 'generate-draft-content',
        name: 'Generate Draft Content',
        description: 'Generates the draft email content using AI',
        enabled: true,
        action: workflowFunctions.generateAutomaticDraft,
        errorHandling: 'continue',
      },
      {
        id: 'create-draft',
        name: 'Create Draft',
        description: 'Creates the draft in the email system',
        enabled: true,
        action: workflowFunctions.createDraft,
        errorHandling: 'continue',
      },
      {
        id: 'cleanup-workflow-execution',
        name: 'Cleanup Workflow Execution',
        description: 'Removes workflow execution tracking',
        enabled: true,
        action: workflowFunctions.cleanupWorkflowExecution,
        errorHandling: 'continue',
      },
    ],
  };

  const vectorizationWorkflow: WorkflowDefinition = {
    name: 'message-vectorization',
    description: 'Vectorizes thread messages for search and analysis',
    steps: [
      {
        id: 'find-messages-to-vectorize',
        name: 'Find Messages to Vectorize',
        description: 'Identifies messages that need vectorization',
        enabled: true,
        condition: isUserTriggered,
        action: workflowFunctions.findMessagesToVectorize,
      },
      {
        id: 'vectorize-messages',
        name: 'Vectorize Messages',
        description: 'Converts messages to vector embeddings',
        enabled: true,
        action: workflowFunctions.vectorizeMessages,
      },
      {
        id: 'upsert-embeddings',
        name: 'Upsert Embeddings',
        description: 'Saves vector embeddings to the database',
        enabled: true,
        action: workflowFunctions.upsertEmbeddings,
        errorHandling: 'continue',
      },
      {
        id: 'cleanup-workflow-execution',
        name: 'Cleanup Workflow Execution',
        description: 'Removes workflow execution tracking',
        enabled: true,
        action: workflowFunctions.cleanupWorkflowExecution,
        errorHandling: 'continue',
      },
    ],
  };

  const threadSummaryWorkflow: WorkflowDefinition = {
    name: 'thread-summary',
    description: 'Generates and stores thread summaries',
    steps: [
      {
        id: 'check-existing-summary',
        name: 'Check Existing Summary',
        description: 'Checks if a thread summary already exists',
        enabled: true,
        // Condition en TÊTE de workflow : son échec `break` toute la chaîne de
        // steps (moteur, L~105), donc aucune étape résumé — Vectorize, IA,
        // upsert — ne tourne sur le pipeline automatique d'arrivée de message.
        condition: isUserTriggered,
        action: workflowFunctions.checkExistingSummary,
      },
      {
        id: 'generate-thread-summary',
        name: 'Generate Thread Summary',
        description: 'Generates a summary of the thread',
        enabled: true,
        action: workflowFunctions.generateThreadSummary,
        errorHandling: 'continue',
      },
      {
        id: 'upsert-thread-summary',
        name: 'Upsert Thread Summary',
        description: 'Saves thread summary to the database',
        enabled: true,
        action: workflowFunctions.upsertThreadSummary,
        errorHandling: 'continue',
      },
      //   {
      //     id: 'cleanup-workflow-execution',
      //     name: 'Cleanup Workflow Execution',
      //     description: 'Removes workflow execution tracking',
      //     enabled: true,
      //     action: workflowFunctions.cleanupWorkflowExecution,
      //     errorHandling: 'continue',
      //   },
    ],
  };

  const labelGenerationWorkflow: WorkflowDefinition = {
    name: 'label-generation',
    description: 'Generates and applies labels to threads',
    steps: [
      {
        id: 'get-user-labels',
        name: 'Get User Labels',
        description: 'Retrieves existing labels from user account',
        enabled: true,
        condition: isUserTriggered,
        action: workflowFunctions.getUserLabels,
      },
      {
        id: 'get-user-topics',
        name: 'Get User Topics',
        description: 'Retrieves user-defined topics for potential new labels',
        enabled: true,
        action: workflowFunctions.getUserTopics,
      },
      {
        id: 'generate-label-suggestions',
        name: 'Generate Label Suggestions',
        description: 'Generates appropriate label suggestions for the thread',
        enabled: true,
        action: workflowFunctions.generateLabelSuggestions,
        errorHandling: 'continue',
      },
      {
        id: 'sync-labels',
        name: 'Sync Labels',
        description: 'Creates missing labels and applies them to the thread',
        enabled: true,
        action: workflowFunctions.syncLabels,
        errorHandling: 'continue',
      },
      {
        id: 'cleanup-workflow-execution',
        name: 'Cleanup Workflow Execution',
        description: 'Removes workflow execution tracking',
        enabled: true,
        action: workflowFunctions.cleanupWorkflowExecution,
        errorHandling: 'continue',
      },
    ],
  };

  // P14 — règles d'équipe : évaluation UNIQUEMENT sur le pipeline automatique
  // d'arrivée de message (jamais sur action utilisateur), fail-safe (une règle
  // cassée n'affecte ni les autres steps ni le mail). Import dynamique pour ne
  // pas charger le store des règles dans les chemins user-triggered.
  const teamRulesWorkflow: WorkflowDefinition = {
    name: 'team-rules',
    description: 'Applies enabled ACL-safe team rules to freshly ingested threads',
    steps: [
      {
        id: 'apply-team-rules',
        name: 'Apply Team Rules',
        description: 'Evaluates and executes enabled team rules for the mailbox of this connection',
        enabled: true,
        condition: (context) => !isUserTriggered(context),
        errorHandling: 'continue',
        action: async (context) => {
          const { applyTeamRulesForContext } = await import('../lib/teams/team-rules-runner');
          const runs = await applyTeamRulesForContext({
            connectionId: context.connectionId,
            threadId: context.threadId,
            thread: context.thread,
          });
          if (runs.length > 0) {
            logger.info('[WORKFLOW_ENGINE] Team rules evaluated', {
              threadId: context.threadId,
              runs: runs.map((run) => ({ ruleId: run.ruleId, outcome: run.outcome })),
            });
          }
          return runs;
        },
      },
    ],
  };

  engine.registerWorkflow(autoDraftWorkflow);
  engine.registerWorkflow(vectorizationWorkflow);
  engine.registerWorkflow(threadSummaryWorkflow);
  engine.registerWorkflow(labelGenerationWorkflow);
  engine.registerWorkflow(teamRulesWorkflow);

  return engine;
};
