// trpc/routes/ai/compose.ts — adaptateurs tRPC de la rédaction assistée.
// La logique de composition vit dans services/compose-service.ts (pitbull A4, axe 1) :
// le domaine ne doit pas dépendre d'une route. Ce module ne fait plus que valider
// l'entrée et appeler le service.
import { type WritingStyleMatrix } from '../../../services/writing-style-service';
import { escapeXml } from '../../../thread-workflow-utils/workflow-utils';
import { composeEmail } from '../../../services/compose-service';
import { activeConnectionProcedure } from '../../trpc';
import { env } from '../../../env';
import { z } from 'zod';

export const compose = activeConnectionProcedure
  .input(
    z.object({
      prompt: z.string(),
      emailSubject: z.string().optional(),
      to: z.array(z.string()).optional(),
      cc: z.array(z.string()).optional(),
      threadMessages: z
        .array(
          z.object({
            from: z.string(),
            to: z.array(z.string()),
            cc: z.array(z.string()).optional(),
            subject: z.string(),
            body: z.string(),
          }),
        )
        .optional()
        .default([]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { sessionUser, activeConnection } = ctx;

    const newBody = await composeEmail({
      ...input,
      username: sessionUser.name,
      connectionId: activeConnection.id,
    });

    return { newBody };
  });

export const generateEmailSubject = activeConnectionProcedure
  .input(
    z.object({
      message: z.string(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { activeConnection } = ctx;
    const { message } = input;

    const { getWritingStyleMatrixForConnectionId } = await import(
      '../../../services/writing-style-service'
    );
    const writingStyleMatrix = await getWritingStyleMatrixForConnectionId({
      connectionId: activeConnection.id,
    });

    const subject = await generateSubject(message, writingStyleMatrix?.style as WritingStyleMatrix);

    return {
      subject,
    };
  });

const generateSubject = async (message: string, styleProfile?: WritingStyleMatrix | null) => {
  const parts: string[] = [];

  parts.push('# Email Subject Generation Task');
  if (styleProfile) {
    parts.push('## Style Profile');
    parts.push(`\`\`\`json
  ${JSON.stringify(styleProfile, null, 2)}
  \`\`\``);
  }

  parts.push('## Email Content');
  parts.push(escapeXml(message));
  parts.push('');
  parts.push(
    'Generate a concise, clear subject line that summarizes the main point of the email. The subject should be professional and under 100 characters.',
  );

  const [{ generateText }, { openai }] = await Promise.all([
    import('ai'),
    import('@ai-sdk/openai'),
  ]);
  const { text } = await generateText({
    model: openai(env.OPENAI_MODEL || 'gpt-4o'),
    messages: [
      {
        role: 'system',
        content:
          'You are an email subject line generator. Generate a concise, clear subject line that summarizes the main point of the email. The subject should be professional and under 100 characters.',
      },
      {
        role: 'user',
        content: parts.join('\n\n'),
      },
    ],
    maxTokens: 50,
    temperature: 0.3,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1,
    maxRetries: 1,
  });

  return text.trim();
};
