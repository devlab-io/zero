// lib/prompt-names.ts — nommage des prompts stockés (pitbull A4, axe 1).
//
// Cette fonction pure vivait dans pipelines.ts, que thread-workflow-utils/workflow-functions.ts
// réimportait alors que pipelines.ts importe workflow-engine : cycle d'imports de valeur entre
// le pipeline et son moteur de workflow. Trois lignes déplacées dans un module feuille, le
// cycle disparaît sans toucher au moteur.

import type { EPrompts } from '../types';

export const getPromptName = (connectionId: string, prompt: EPrompts) =>
  `${connectionId}-${prompt}`;
