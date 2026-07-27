import { describe, expect, it, vi, afterEach } from 'vitest';

import type { Attachment, ParsedMessage } from '@/types';

import { buildThreadPrintDocument, printThread } from './thread-display.print';
import { buildMailPrintDocument, printMail } from './mail-display.print';
import { PRINT_IFRAME_SANDBOX } from './print-styles';

/**
 * XSS STOCKÉ, PROUVÉ EN NAVIGATEUR — chemin d'impression.
 *
 * Avant ce correctif, `mail-display.print.ts` et `thread-display.print.ts` interpolaient le
 * SUJET BRUT d'un e-mail (et l'expéditeur, les destinataires, les noms de pièces jointes)
 * dans un document remis à `iframeDoc.write` d'une iframe SANS attribut `sandbox`. La
 * démonstration de l'auditeur, rejouée à l'identique dans Chromium avec la CSP verbatim de
 * `workers/spa-fallback.ts`, rendait `RESULT {"xss":true,"title":"PWNED"}` et ZÉRO violation
 * CSP : `script-src 'unsafe-inline'` autorise un gestionnaire `onerror` inline, la CSP ne
 * pouvait donc rien bloquer. L'iframe étant même-origine, le script s'exécutait dans la page
 * parente authentifiée.
 *
 * CE QUE CE TEST EXERCE — la forme que la PRODUCTION fabrique :
 *   1. `buildMailPrintDocument` / `buildThreadPrintDocument` sont les fonctions dont
 *      `printMail` / `printThread` remettent LE RÉSULTAT à `iframeDoc.write` : le test
 *      inspecte la chaîne réellement écrite, pas une reconstruction ;
 *   2. le dernier bloc appelle `printMail` / `printThread` eux-mêmes et vérifie que la
 *      chaîne écrite dans l'iframe est bien celle du constructeur, et que l'iframe porte
 *      l'attribut `sandbox`.
 */

// Charges hostiles : chacune est du HTML actif si elle n'est pas échappée.
const PAYLOADS = {
  imgOnerror: `<img src=x onerror="window.__pwned=1">`,
  titleBreakout: `</title><script>window.__pwned=1</script>`,
  quotes: `" onmouseover="window.__pwned=1" x="`,
  singleQuotes: `' onfocus='window.__pwned=1`,
  angles: `<b>gras</b> < >`,
  ampersand: `a & b &amp; c &lt;script&gt;`,
  svg: `<svg/onload=window.__pwned=1>`,
};
const HOSTILE = Object.values(PAYLOADS).join(' ');

const message = (over: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    threadId: 't1',
    subject: HOSTILE,
    receivedOn: '2026-07-27T10:00:00.000Z',
    decodedBody: '<p>corps benin</p>',
    sender: { name: HOSTILE, email: `mallory+${PAYLOADS.imgOnerror}@evil.test` },
    to: [{ name: HOSTILE, email: `to+${PAYLOADS.svg}@zero.test` }],
    cc: [{ name: HOSTILE, email: `cc+${PAYLOADS.titleBreakout}@zero.test` }],
    bcc: [{ name: HOSTILE, email: `bcc+${PAYLOADS.quotes}@zero.test` }],
    tags: [{ id: 'l1', name: HOSTILE }],
    attachments: [],
    ...over,
  }) as unknown as ParsedMessage;

const attachments = [
  { filename: `${PAYLOADS.imgOnerror}facture.pdf`, size: 2 * 1024 * 1024 },
] as unknown as Attachment[];

/** Aucune BALISE ACTIVE ne doit survivre dans le document rendu. */
const assertInert = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('script')).toHaveLength(0);
  expect(doc.querySelectorAll('img')).toHaveLength(0);
  expect(doc.querySelectorAll('svg')).toHaveLength(0);
  expect(doc.querySelectorAll('b')).toHaveLength(0);
  // Aucun gestionnaire d'événement, sur aucun élément.
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
    }
  }
  // Ni dans la source : plus aucune OUVERTURE de balise active. (`onerror=` subsiste en
  // texte échappé — `&lt;img … onerror=…&gt;` — ce qui est précisément le but : la chaîne
  // reste lisible, elle n'est plus du balisage. Le balayage d'attributs ci-dessus est ce
  // qui prouve qu'aucun gestionnaire n'a survécu.)
  expect(/<script/i.test(html)).toBe(false);
  expect(/<img/i.test(html)).toBe(false);
  expect(/<svg/i.test(html)).toBe(false);
  return doc;
};

describe("document d'impression d'un e-mail (buildMailPrintDocument)", () => {
  it('rend inerte un sujet hostile tout en le conservant lisible', () => {
    const html = buildMailPrintDocument(message(), attachments);
    const doc = assertInert(html);

    // Le sujet reste AFFICHÉ, mais comme du texte.
    expect(doc.querySelector('h1.email-title')?.textContent).toBe(HOSTILE);
    expect(doc.querySelector('title')?.textContent).toBe(`Print Email - ${HOSTILE}`);
    // L'esperluette est bien encodée une seule fois (pas de double échappement).
    expect(html).toContain('&amp;amp;');
    expect(html).toContain('&lt;script&gt;');
  });

  it("échappe l'expéditeur, les destinataires, les étiquettes et les pièces jointes", () => {
    const html = buildMailPrintDocument(message(), attachments);
    const doc = assertInert(html);

    const values = Array.from(doc.querySelectorAll('.meta-value')).map((n) => n.textContent ?? '');
    // From / To / CC / BCC / Date
    expect(values.length).toBeGreaterThanOrEqual(5);
    for (const label of ['From:', 'To:', 'CC:', 'BCC:']) {
      expect(html).toContain(label);
    }
    expect(doc.querySelector('.label-badge')?.textContent).toBe(HOSTILE);
    expect(doc.querySelector('.attachment-name')?.textContent).toBe(attachments[0]!.filename);
    // Les adresses restent encadrées de chevrons AFFICHÉS, pas de vraies balises.
    expect(values.some((v) => v.includes('<') && v.includes('>'))).toBe(true);
  });

  it('reste inerte sans pièce jointe, sans étiquette et sans destinataire', () => {
    const html = buildMailPrintDocument(message({ tags: [], to: [], cc: [], bcc: [] }), undefined);
    assertInert(html);
  });

  it('laisse passer le corps assaini et conserve le repli sans sujet', () => {
    const html = buildMailPrintDocument(message({ subject: '' }), undefined);
    const doc = assertInert(html);
    expect(doc.querySelector('h1.email-title')?.textContent).toBe('No Subject');
    expect(doc.querySelector('.email-content')?.textContent?.trim()).toContain('corps benin');
  });
});

describe("document d'impression d'un fil (buildThreadPrintDocument)", () => {
  it('rend inerte un sujet hostile sur tous les messages du fil', () => {
    const html = buildThreadPrintDocument({
      latest: message(),
      messages: [message(), message({ id: 'm2', attachments })],
    });
    const doc = assertInert(html);
    expect(doc.querySelector('title')?.textContent).toBe(`Print Thread - ${HOSTILE}`);
    expect(doc.querySelector('h1.email-title')?.textContent).toBe(HOSTILE);
    expect(doc.querySelectorAll('.email-container')).toHaveLength(2);
    expect(doc.querySelector('.attachment-name')?.textContent).toBe(attachments[0]!.filename);
  });

  it('reste inerte avec un fil vide', () => {
    assertInert(buildThreadPrintDocument({ latest: null, messages: [] }));
  });
});

// --- chaîne réelle : ce que printMail/printThread écrivent VRAIMENT dans l'iframe -------

type WrittenFrame = { sandbox: string | null; written: string };

const captureIframe = (): WrittenFrame[] => {
  const frames: WrittenFrame[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'iframe') return realCreate(tag);
    const record: WrittenFrame = { sandbox: null, written: '' };
    frames.push(record);
    const doc = {
      open: () => {},
      write: (html: string) => {
        record.written += html;
      },
      close: () => {},
    };
    return {
      style: {},
      setAttribute: (name: string, value: string) => {
        if (name === 'sandbox') record.sandbox = value;
      },
      contentDocument: doc,
      contentWindow: { document: doc, focus: () => {}, print: () => {} },
      parentNode: null,
    } as unknown as HTMLIFrameElement;
  }) as typeof document.createElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation(((node: unknown) => node) as never);
  return frames;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chaîne réelle jusqu'à iframeDoc.write", () => {
  it('printMail écrit le document construit dans une iframe bac à sable', () => {
    const frames = captureIframe();
    printMail(message(), attachments);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.sandbox).toBe(PRINT_IFRAME_SANDBOX);
    expect(frames[0]!.sandbox).not.toContain('allow-scripts');
    expect(frames[0]!.written).toBe(buildMailPrintDocument(message(), attachments));
    assertInert(frames[0]!.written);
  });

  it('printThread écrit le document construit dans une iframe bac à sable', () => {
    const frames = captureIframe();
    const thread = { latest: message(), messages: [message()] };
    printThread(thread);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.sandbox).toBe(PRINT_IFRAME_SANDBOX);
    expect(frames[0]!.sandbox).not.toContain('allow-scripts');
    expect(frames[0]!.written).toBe(buildThreadPrintDocument(thread));
    assertInert(frames[0]!.written);
  });
});
