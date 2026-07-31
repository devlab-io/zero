import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r13 : garde CI du graphe critique du reload mail. Le diagnostic CUA a montré
// que le segment dominant est bundle/hydratation → route-mounted (~1,2 s) ;
// la sidebar et le menu contextuel de ligne en sont sortis. Ce test échoue si
// un import STATIQUE les y ramène.

const APP_ROOT = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(APP_ROOT, relative), 'utf8');

describe('graphe critique du reload mail (r13)', () => {
  it('le layout mail n’importe PLUS AppSidebar statiquement — uniquement la version différée', () => {
    const layout = read('app/(routes)/mail/layout.tsx');
    expect(layout).not.toMatch(/from '@\/components\/ui\/app-sidebar'/);
    expect(layout).toContain("from '@/components/ui/app-sidebar.deferred'");
  });

  it('la ligne de liste n’importe PLUS thread-context statiquement — pass-through différé', () => {
    const row = read('components/mail/mail-list-thread.tsx');
    expect(row).not.toMatch(/from '@\/components\/context\/thread-context'/);
    expect(row).toContain("from '@/components/context/thread-context.deferred'");
  });

  it('les modules différés chargent leur cible en import() DYNAMIQUE uniquement', () => {
    const sidebar = read('components/ui/app-sidebar.deferred.tsx');
    expect(sidebar).toContain("import('@/components/ui/app-sidebar')");
    expect(sidebar).not.toMatch(/^import .*from '@\/components\/ui\/app-sidebar';/m);
    const menu = read('components/context/thread-context.deferred.tsx');
    expect(menu).toContain("import('./thread-context')");
    // Seul un import de TYPE (erasé à la compilation) est admis.
    expect(menu).toMatch(/import type \{[^}]*\} from '\.\/thread-context'/);
  });

  it('entry.client pose le jalon entry-evaluated avant hydrateRoot', () => {
    const entry = read('app/entry.client.tsx');
    const markIndex = entry.indexOf("performance.mark('zero:boot:entry-evaluated')");
    const hydrateIndex = entry.indexOf('hydrateRoot(');
    expect(markIndex).toBeGreaterThan(-1);
    expect(hydrateIndex).toBeGreaterThan(markIndex);
  });
});
