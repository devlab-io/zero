// escape-html — échappement HTML unique et réutilisable pour les documents que le front
// construit À LA MAIN par concaténation de chaînes.
//
// Pourquoi ce fichier existe : les documents d'impression (components/mail/*.print.ts)
// interpolaient le sujet, l'expéditeur, les destinataires et les noms de pièces jointes —
// tous contrôlés par l'EXPÉDITEUR d'un e-mail — dans un document écrit par
// `iframeDoc.write`. Un sujet `</title><img src=x onerror=…>` exécutait donc du script dans
// une iframe même-origine de la page authentifiée. La CSP de production
// (`script-src 'self' 'unsafe-inline'`, workers/spa-fallback.ts) n'oppose aucun obstacle à
// un gestionnaire d'événement inline : elle ne peut pas servir de garde-fou ici.
//
// PORTÉE. Cette fonction protège les contextes TEXTE (contenu d'élément, y compris
// `<title>`) et les valeurs d'ATTRIBUT ENTRE GUILLEMETS (simples ou doubles). Elle ne suffit
// PAS pour : un attribut sans guillemets, l'intérieur d'un `<script>`, d'un `<style>`, ou
// une URL (`href`/`src`), qui demandent chacun un encodage propre. React échappe déjà seul —
// ceci ne concerne QUE le HTML assemblé à la main.
//
// L'ordre des remplacements est significatif : `&` d'abord, sinon les entités produites par
// les remplacements suivants seraient elles-mêmes ré-échappées.
export const escapeHtml = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
