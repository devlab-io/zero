import { useActiveConnection } from '@/hooks/use-connections';
import type { DraftOwner } from '@/lib/draft-storage';
import { Fragment, type ReactNode } from 'react';
import { useSession } from '@/lib/auth-client';

/**
 * Résolution de l'owner {userId, connectionId} par le PARENT du composeur
 * (owner-transition fix 2026-08-01). Deux garanties structurelles :
 *
 * 1. FAIL-CLOSED : tant que session + connexion active ne sont pas résolues,
 *    AUCUN composeur n'est peint — il n'existe jamais d'instance « sans
 *    owner » dont l'état pourrait être adopté par le premier compte résolu.
 * 2. REMOUNT ATOMIQUE : le sous-arbre est keyé sur l'owner stable
 *    (`userId:connectionId`). Un changement de compte/connexion démonte
 *    l'ancienne instance (qui flushe son contenu sous SA clé v2) et monte une
 *    instance neuve initialisée depuis la restauration ownée du NOUVEAU
 *    compte — le formulaire/TipTap de A n'est jamais peint ni persisté sous B.
 */
export function ComposerOwnerGate({ children }: { children: (owner: DraftOwner) => ReactNode }) {
  const { data: session } = useSession();
  const { data: connection } = useActiveConnection();
  const userId = session?.user?.id;
  const connectionId = connection?.id;
  if (!userId || !connectionId) return null;
  return (
    <Fragment key={`${userId}:${connectionId}`}>{children({ userId, connectionId })}</Fragment>
  );
}
