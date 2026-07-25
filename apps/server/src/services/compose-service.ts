// services/compose-service.ts — rédaction assistée d'un email (pitbull A4, axe 1).
//
// `composeEmail` vivait dans trpc/routes/ai/compose.ts : le domaine (thread-workflow-utils,
// outils de l'agent, serveur MCP) importait donc une ROUTE tRPC, inversion du sens des
// dépendances où la couche transport devient une dépendance du métier. La logique vit
// désormais ici ; la procédure tRPC n'est plus qu'un adaptateur d'entrée.
//
// Les imports dynamiques du corps sont conservés à dessein : ils gardent la pile IA
// (ai, @ai-sdk/*, string-strip-html) hors du graphe statique de l'isolate — décision de perf
// du commit d689e507, indépendante de ce déplacement.

import { escapeXml } from '../thread-workflow-utils/workflow-utils';
import { type WritingStyleMatrix } from './writing-style-service';
import { StyledEmailAssistantSystemPrompt } from '../lib/prompts';
import { getPrompt } from '../lib/brain';
import { EPrompts } from '../types';
import { env } from '../env';

type ComposeEmailInput = {
  prompt: string;
  emailSubject?: string;
  to?: string[];
  cc?: string[];
  threadMessages?: Array<{
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
  }>;
  username: string;
  connectionId: string;
};

export async function composeEmail(input: ComposeEmailInput) {
  const { prompt, threadMessages = [], cc, emailSubject, to, username, connectionId } = input;

  // The AI SDK stack (and the agent toolset) is only exercised on this cold path —
  // keep it out of the isolate's static import graph.
  const [
    { getWritingStyleMatrixForConnectionId },
    { stripHtml },
    { generateText },
    { openai },
    { webSearch },
  ] = await Promise.all([
    import('./writing-style-service'),
    import('string-strip-html'),
    import('ai'),
    import('@ai-sdk/openai'),
    import('./web-search-tool'),
  ]);

  const writingStyleMatrix = await getWritingStyleMatrixForConnectionId({
    connectionId,
  });

  const systemPrompt = await getPrompt(
    `${connectionId}-${EPrompts.Compose}`,
    StyledEmailAssistantSystemPrompt(),
  );
  const userPrompt = EmailAssistantPrompt({
    currentSubject: emailSubject,
    recipients: [...(to ?? []), ...(cc ?? [])],
    prompt,
    username,
    styleProfile: writingStyleMatrix?.style as WritingStyleMatrix,
  });

  const threadUserMessages = threadMessages.map((message) => ({
    role: 'user' as const,
    content: MessagePrompt({
      ...message,
      body: stripHtml(message.body).result,
    }),
  }));

  const messages =
    threadMessages.length > 0
      ? [
          {
            role: 'user' as const,
            content: "I'm going to give you the current email thread replies one by one.",
          } as const,
          {
            role: 'assistant' as const,
            content: 'Got it. Please proceed with the thread replies.',
          } as const,
          ...threadUserMessages,
          {
            role: 'assistant' as const,
            content: 'Got it. Please proceed with the email composition prompt.',
          },
        ]
      : [
          {
            role: 'user' as const,
            content: 'Now, I will give you the prompt to write the email.',
          },
          {
            role: 'assistant' as const,
            content: 'Ok, please continue with the email composition prompt.',
          },
        ];

  const { text } = await generateText({
    model: openai(env.OPENAI_MINI_MODEL || 'gpt-4o-mini'),
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    maxSteps: 10,
    maxTokens: 2_000,
    temperature: 0.35,
    frequencyPenalty: 0.2,
    presencePenalty: 0.1,
    maxRetries: 1,
    tools: {
      webSearch: webSearch(),
    },
  });

  return text;
}

const MessagePrompt = ({
  from,
  to,
  cc,
  body,
  subject,
}: {
  from: string;
  to: string[];
  cc?: string[];
  body: string;
  subject: string;
}) => {
  const parts: string[] = [];
  parts.push(`From: ${from}`);
  parts.push(`To: ${to.join(', ')}`);
  if (cc && cc.length > 0) {
    parts.push(`CC: ${cc.join(', ')}`);
  }
  parts.push(`Subject: ${subject}`);
  parts.push('');
  parts.push(`Body: ${body}`);

  return parts.join('\n');
};

const EmailAssistantPrompt = ({
  currentSubject,
  recipients,
  prompt,
  username,
  styleProfile,
}: {
  currentSubject?: string;
  recipients?: string[];
  prompt: string;
  username: string;
  styleProfile?: WritingStyleMatrix | null;
}) => {
  const parts: string[] = [];

  parts.push('# Email Composition Task');
  if (styleProfile) {
    parts.push('## Style Profile');
    parts.push(`\`\`\`json
  ${JSON.stringify(styleProfile, null, 2)}
  \`\`\``);
  }

  parts.push('## Email Context');

  if (currentSubject) {
    parts.push('## The current subject is:');
    parts.push(escapeXml(currentSubject));
    parts.push('');
  }

  if (recipients && recipients.length > 0) {
    parts.push('## The recipients are:');
    parts.push(recipients.join('\n'));
    parts.push('');
  }

  parts.push(
    '## This is a prompt from the user that could be empty, a rough email, or an instruction to write an email.',
  );
  parts.push(escapeXml(prompt));
  parts.push('');

  parts.push("##This is the user's name:");
  parts.push(escapeXml(username));
  parts.push('');

  parts.push(
    'Please write an email using this context and instruction. If there are previous messages in the thread use those for more context.',
    'Make sure to examine all context in this conversation to ALWAYS generate some sort of reply.',
    'Do not include ANYTHING other than the body of the email you write.',
  );

  return parts.join('\n\n');
};
