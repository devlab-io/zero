/**
 * Substitue les refs `cid:` d'un fragment DOM par les data URIs des images
 * inline du message. Le corps peint AVANT que les images n'arrivent (le sync ne
 * les inline plus — l'ancienne boucle coûtait 4-7 s de chemin froid) ; cette
 * passe ré-affiche aussi les <img> masquées par le gestionnaire d'erreur
 * pendant l'attente. Pure DOM : testable sans le composant.
 */
export function resolveCidImages(
  root: { querySelectorAll: (selector: string) => Iterable<Element> },
  images: readonly { contentId: string | null; mimeType: string; body: string }[],
): number {
  let resolved = 0;
  const byContentId = new Map(
    images
      .filter((image) => image.contentId && image.body)
      .map((image) => [image.contentId as string, image]),
  );
  for (const el of root.querySelectorAll('img[src^="cid:"]')) {
    const img = el as HTMLImageElement;
    const contentId = decodeURIComponent(img.getAttribute('src')?.slice(4) ?? '');
    const match = byContentId.get(contentId);
    if (!match) continue;
    img.src = `data:${match.mimeType};base64,${match.body}`;
    img.style.display = '';
    resolved++;
  }
  return resolved;
}
