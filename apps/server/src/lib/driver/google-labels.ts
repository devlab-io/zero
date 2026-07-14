import { mapGoogleLabelColor, mapToGoogleLabelColor } from './google-label-color-map';
import type { GmailTransport } from './google-transport';
import { type gmail_v1 } from '@googleapis/gmail';
import type { Label } from '../../types';
import { Effect } from 'effect';

export class GmailLabels {
  private labelIdCache: Record<string, string> = {};

  private readonly systemLabelIds = new Set<string>([
    'INBOX',
    'TRASH',
    'SPAM',
    'DRAFT',
    'SENT',
    'STARRED',
    'UNREAD',
    'IMPORTANT',
    'CATEGORY_PERSONAL',
    'CATEGORY_SOCIAL',
    'CATEGORY_UPDATES',
    'CATEGORY_FORUMS',
    'CATEGORY_PROMOTIONS',
    'MUTED',
  ]);

  constructor(private readonly t: GmailTransport) {}

  public count() {
    return this.t.withErrorHandler(
      'count',
      async () => {
        type LabelCount = { label: string; count: number };

        const getUserLabelsEffect = Effect.tryPromise({
          try: () => this.t.execute((gmail) => gmail.users.labels.list({ userId: 'me' })),
          catch: (error) => ({ _tag: 'LabelListFailed' as const, error }),
        });

        const getArchiveCountEffect = Effect.tryPromise({
          try: () =>
            this.t.execute((gmail) =>
              gmail.users.threads.list({
                userId: 'me',
                q: 'in:archive',
                maxResults: 1,
              }),
            ),
          catch: (error) => ({ _tag: 'ArchiveFetchFailed' as const, error }),
        });

        const processLabelEffect = (label: gmail_v1.Schema$Label) =>
          Effect.tryPromise({
            try: () =>
              this.t.execute((gmail) =>
                gmail.users.labels.get({
                  userId: 'me',
                  id: label.id ?? undefined,
                }),
              ),
            catch: (error) => ({ _tag: 'LabelFetchFailed' as const, error, labelId: label.id }),
          }).pipe(
            Effect.map((res) => {
              if ('_tag' in res) return null;

              let labelName = (res.data.name ?? res.data.id ?? '').toLowerCase();
              if (labelName === 'draft') {
                labelName = 'drafts';
              }
              const isTotalLabel = labelName === 'drafts' || labelName === 'sent';
              return {
                label: labelName,
                count: Number(isTotalLabel ? res.data.threadsTotal : res.data.threadsUnread),
              };
            }),
          );

        const mainEffect = Effect.gen(function* () {
          // Fetch user labels and archive count concurrently
          const [userLabelsResult, archiveResult] = yield* Effect.all(
            [getUserLabelsEffect, getArchiveCountEffect],
            { concurrency: 'unbounded' },
          );

          // Handle label list failure
          if ('_tag' in userLabelsResult && userLabelsResult._tag === 'LabelListFailed') {
            return [];
          }

          const labels = userLabelsResult.data.labels || [];
          if (labels.length === 0) {
            return [];
          }

          // Process all labels concurrently
          const labelEffects = labels.map(processLabelEffect);
          const labelResults = yield* Effect.all(labelEffects, { concurrency: 'unbounded' });

          // Filter and collect results
          const mapped: LabelCount[] = labelResults.filter(
            (item): item is LabelCount => item !== null,
          );

          // Add archive count if successful
          if (!('_tag' in archiveResult)) {
            mapped.push({
              label: 'archive',
              count: Number(archiveResult.data.resultSizeEstimate ?? 0),
            });
          }

          return mapped;
        });

        return await Effect.runPromise(mainEffect);
      },
      { email: this.t.config.auth?.email },
    );
  }

  public modifyLabels(
    threadIds: string[],
    addOrOptions: { addLabels: string[]; removeLabels: string[] } | string[],
    maybeRemove?: string[],
  ) {
    const options = Array.isArray(addOrOptions)
      ? { addLabels: addOrOptions as string[], removeLabels: maybeRemove ?? [] }
      : addOrOptions;
    return this.t.withErrorHandler(
      'modifyLabels',
      async () => {
        const addLabelIds = await Promise.all(
          (options.addLabels || []).map((lbl) => this.resolveLabelId(lbl)),
        );
        const removeLabelIds = await Promise.all(
          (options.removeLabels || []).map((lbl) => this.resolveLabelId(lbl)),
        );

        await this.modifyThreadLabels(threadIds, {
          addLabelIds,
          removeLabelIds,
        });
      },
      { threadIds, options },
    );
  }

  public async getUserLabels() {
    const res = await this.t.execute((gmail) =>
      gmail.users.labels.list({
        userId: 'me',
      }),
    );
    // wtf google, null values for EVERYTHING?
    return (
      res.data.labels?.map((label) => ({
        id: label.id ?? '',
        name: label.name ?? '',
        type: label.type ?? '',
        color: mapGoogleLabelColor({
          backgroundColor: label.color?.backgroundColor ?? '',
          textColor: label.color?.textColor ?? '',
        }),
      })) ?? []
    );
  }

  public async getLabel(labelId: string): Promise<Label> {
    const res = await this.t.execute((gmail) =>
      gmail.users.labels.get({
        userId: 'me',
        id: labelId,
      }),
    );
    return {
      id: labelId,
      name: res.data.name ?? '',
      color: mapGoogleLabelColor({
        backgroundColor: res.data.color?.backgroundColor ?? '',
        textColor: res.data.color?.textColor ?? '',
      }),
      type: res.data.type ?? 'user',
    };
  }

  public async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }) {
    await this.t.execute((gmail) =>
      gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: label.name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
          color: label.color
            ? mapToGoogleLabelColor({
                backgroundColor: label.color.backgroundColor,
                textColor: label.color.textColor,
              })
            : undefined,
        },
      }),
    );
  }

  public async updateLabel(id: string, label: Label) {
    await this.t.execute((gmail) =>
      gmail.users.labels.update({
        userId: 'me',
        id: id,
        requestBody: {
          name: label.name,
          color: label.color
            ? mapToGoogleLabelColor({
                backgroundColor: label.color.backgroundColor,
                textColor: label.color.textColor,
              })
            : undefined,
        },
      }),
    );
  }

  public async deleteLabel(id: string) {
    await this.t.execute((gmail) =>
      gmail.users.labels.delete({
        userId: 'me',
        id: id,
      }),
    );
  }

  public async modifyThreadLabels(
    threadIds: string[],
    requestBody: gmail_v1.Schema$ModifyThreadRequest,
  ) {
    if (threadIds.length === 0) {
      return;
    }

    const chunkSize = 15;
    const delayBetweenChunks = 100;
    const allResults: Array<{
      threadId: string;
      status: 'fulfilled' | 'rejected';
      value?: unknown;
      reason?: unknown;
    }> = [];

    for (let i = 0; i < threadIds.length; i += chunkSize) {
      const chunk = threadIds.slice(i, i + chunkSize);

      const effects = chunk.map((threadId) =>
        Effect.tryPromise({
          try: async () => {
            const response = await this.t.execute((gmail) =>
              gmail.users.threads.modify({
                userId: 'me',
                id: threadId,
                requestBody,
              }),
            );
            return { threadId, status: 'fulfilled' as const, value: response.data };
          },
          catch: (error) => {
            const err = error as { errors?: Array<{ message?: string }>; message?: string };
            const errorMessage = err?.errors?.[0]?.message || err.message || error;
            return { threadId, status: 'rejected' as const, reason: { error: errorMessage } };
          },
        }),
      );

      const chunkResults = await Effect.runPromise(
        Effect.all(effects, { concurrency: 'unbounded' }),
      );
      allResults.push(...chunkResults);

      if (i + chunkSize < threadIds.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenChunks));
      }
    }

    const failures = allResults.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      const failureReasons = failures.map((f) => ({ threadId: f.threadId, reason: f.reason }));
      const first = failureReasons[0];
      throw new Error(
        `Failed to modify labels for thread ${first.threadId}: ${JSON.stringify(first.reason)}`,
      );
    }
  }

  private async resolveLabelId(labelName: string): Promise<string> {
    if (this.systemLabelIds.has(labelName)) {
      return labelName;
    }

    if (this.labelIdCache[labelName]) {
      return this.labelIdCache[labelName];
    }

    const userLabels = await this.getUserLabels();
    const existing = userLabels.find((l) => l.name?.toLowerCase() === labelName.toLowerCase());
    if (existing && existing.id) {
      this.labelIdCache[labelName] = existing.id;
      return existing.id;
    }
    const prettifiedName = labelName.charAt(0).toUpperCase() + labelName.slice(1).toLowerCase();
    await this.createLabel({ name: prettifiedName });

    const refreshedLabels = await this.getUserLabels();
    const created = refreshedLabels.find(
      (l) => l.name?.toLowerCase() === prettifiedName.toLowerCase(),
    );
    if (!created || !created.id) {
      throw new Error(`Failed to create or retrieve Gmail label '${labelName}'.`);
    }

    this.labelIdCache[labelName] = created.id;
    return created.id;
  }
}
