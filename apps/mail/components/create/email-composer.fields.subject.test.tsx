import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { act } from 'react';

// CUA 2026-07-30 (obs 5, faux positif) : le composer neuf ouvert via `c` a été rapporté
// « pré-rempli » avec "Re: Design review feedback". C'était le PLACEHOLDER (copy marketing
// partagé avec les cartes de la landing), exposé comme valeur par l'outillage
// d'accessibilité sur un input vide — pas une fuite d'état. Ce test fige le contrat :
// (1) un composer neuf a un sujet réellement VIDE (value === ''), (2) le placeholder du
// sujet est un libellé neutre, jamais un contenu plausible de fil ("Re: …"), (3) le champ
// porte un aria-label explicite pour que l'arbre AX nomme le champ au lieu d'en inventer
// le contenu.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// L'autosuggest destinataires tire la surface cmdk — hors du contrat testé ici.
vi.mock('@/components/ui/recipient-autosuggest', () => ({
  RecipientAutosuggest: () => <div data-testid="autosuggest" />,
}));

import type { ComposerFormValues } from './email-composer.types';
import { ComposerHeader } from './email-composer.fields';

function FreshComposerHeader() {
  // Mêmes defaults qu'un composer neuf dans email-composer.tsx : ni brouillon restauré,
  // ni initialSubject — le sujet part vide.
  const form = useForm<ComposerFormValues>({
    defaultValues: { to: [], cc: [], bcc: [], subject: '', message: '', attachments: [] },
  });
  return (
    <ComposerHeader
      control={form.control}
      isLoading={false}
      showCc={false}
      showBcc={false}
      onToggleCc={() => {}}
      onToggleBcc={() => {}}
      canClose={false}
      onCloseClick={() => {}}
      activeReplyId={null}
      subjectInput={form.watch('subject')}
      onSubjectInputChange={() => {}}
      aliases={undefined}
      fromEmail=""
      onFromChange={() => {}}
    />
  );
}

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('subject field of a fresh composer (CUA obs 5 regression)', () => {
  it('value is truly empty; placeholder is a neutral label, never thread-like content', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<FreshComposerHeader />));

    const subject = container.querySelector<HTMLInputElement>('input[aria-label]');
    expect(subject).not.toBeNull();

    // (1) Le sujet d'un composer neuf est réellement vide — ce que la CUA a lu était
    // le placeholder, pas l'état.
    expect(subject!.value).toBe('');

    // (2) Le placeholder ne doit jamais ressembler à un contenu de fil réel.
    expect(subject!.placeholder.startsWith('Re:')).toBe(false);
    expect(subject!.placeholder).not.toContain('Design review feedback');
    expect(subject!.placeholder.length).toBeGreaterThan(0);

    // (3) Le champ est nommé pour l'arbre d'accessibilité.
    expect(subject!.getAttribute('aria-label')).toBe(subject!.placeholder);
  });
});
