// services/compose-service.ts — rédaction assistée d'un email (pitbull A4, axe 1).
//
// `composeEmail` vivait dans trpc/routes/ai/compose.ts : le domaine (thread-workflow-utils,
// outils de l'agent, serveur MCP) importait donc une ROUTE tRPC, inversion du sens des
// dépendances où la couche transport devient une dépendance du métier. La logique vit
// désormais ici ; la procédure tRPC n'est plus qu'un adaptateur d'entrée.
//
// Les imports dynamiques du corps sont conservés à dessein : ils gardent la pile IA
// (ai, @ai-sdk/*) hors du graphe statique de l'isolate — décision de perf du commit d689e507,
// indépendante de ce déplacement.

import { sanitizeMailContent, sanitizeMailField } from '../lib/mail-sanitize';
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

  // The AI SDK stack is only exercised on this cold path — keep it out of the isolate's
  // static import graph.
  const [{ getWritingStyleMatrixForConnectionId }, { generateText }, { openai }] =
    await Promise.all([import('./writing-style-service'), import('ai'), import('@ai-sdk/openai')]);

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

  // Point d'entrée UNIQUE du courrier entrant vers le modèle. Le `stripHtml` d'origine ne
  // retirait que le balisage : une consigne cachée en `display:none`, en blanc sur blanc ou
  // masquée par une classe CSS arrivait en clair dans un message `role: 'user'` — la position
  // même où le modèle attend des instructions. La sanitisation vit ICI, dans le service, et
  // non chez les appelants : composeEmail est appelée depuis le workflow de brouillon
  // automatique, la route tRPC, les outils de l'agent et le serveur MCP, et aucun d'eux ne
  // doit pouvoir l'oublier.
  const threadUserMessages = threadMessages.map((message) => ({
    role: 'user' as const,
    content: MessagePrompt({
      ...message,
      body: sanitizeMailContent(message.body).text,
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
    // Aucun outil. `webSearch` était câblé ici : rédiger une réponse n'en a aucun besoin, et
    // il constituait un CANAL DE SORTIE — une consigne dissimulée dans le mail entrant pouvait
    // faire émettre une requête portant le contenu de la boîte vers un tiers. Il reste
    // disponible là où un utilisateur le demande explicitement (routes/agent/tools.ts,
    // trpc/routes/ai/webSearch.ts).
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
  // Le corps est sanitisé par l'appelant, mais `from`, `to`, `cc` et `subject` étaient
  // recopiés BRUTS. Ce rendu est une suite de LIGNES `Clé: valeur` remise en `role: 'user'` :
  // un saut de ligne dans un sujet ou un nom d'expéditeur y fabrique une ligne de son choix,
  // à la position même où le modèle attend des instructions.
  const field = (value: string, fallback: string) => sanitizeMailField(value, fallback);

  const parts: string[] = [];
  parts.push(`From: ${field(from, '(unknown sender)')}`);
  parts.push(`To: ${to.map((recipient) => field(recipient, '(unknown)')).join(', ')}`);
  if (cc && cc.length > 0) {
    parts.push(`CC: ${cc.map((recipient) => field(recipient, '(unknown)')).join(', ')}`);
  }
  parts.push(`Subject: ${field(subject, '(no subject)')}`);
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
