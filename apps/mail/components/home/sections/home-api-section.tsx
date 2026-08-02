import { productBrand } from '@/lib/brand';

/**
 * Section BYOK + MCP — l'IA reste un choix, jamais le centre de la boîte.
 * Statique (zéro motion), tokens clair/sombre, h2 (un seul h1 par page).
 */

const codeSample = `# ~/.codex/config.toml
[mcp_servers.reta]
url = "https://<your-reta-host>/mcp"

# Safe-by-default agent surface
listThreads · searchThreads · getThread
createDraft · enqueueDraftJob
updateDraft · sendConfirmedDraft

# sendConfirmedDraft requires explicit human confirmation`;

const capabilities = [
  'Inspect and search threads through a documented MCP surface',
  'Ask Reta answers from your mailbox with your own model key (BYOK) — only when you ask',
  'Agents can create or edit drafts; sending runs only after explicit in-tool human confirmation',
];

export function HomeApiSection() {
  return (
    <section className="relative mt-32 px-4 md:mt-40">
      <p className="text-center text-lg font-light text-zinc-600 md:text-xl dark:text-zinc-200">
        AI-agnostic · API-first · MCP-native
      </p>
      <div className="mt-2 flex flex-col items-center justify-center md:mt-8">
        <h2 className="text-center text-4xl font-medium text-zinc-950 md:text-6xl dark:text-white">
          Your inbox, your models
        </h2>
        <h2 className="mb-3 text-center text-4xl font-medium text-zinc-600 md:text-6xl dark:text-zinc-200">
          your rules
        </h2>
      </div>
      <div className="mx-auto mt-6 grid w-full max-w-[1100px] grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col items-start gap-5">
          <p className="max-w-md text-base font-normal leading-7 text-zinc-600 dark:text-zinc-200">
            {productBrand.name} never makes a model the center of your mailbox. Bring your own AI —
            or none at all — and connect an MCP-compatible tool to an ACL-scoped surface. Draft
            sending is exposed only through an explicit human-confirmation step; email deletion is
            not exposed.
          </p>
          <ul className="flex flex-col gap-3">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="flex items-start gap-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6f00ff] dark:bg-[#c9afff]" />
                {capability}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-panelDark overflow-hidden rounded-2xl border border-[#252525] shadow-md">
          <div className="flex h-10 items-center gap-1.5 border-b border-[#252525] px-4">
            <span className="size-2.5 rounded-full bg-[#313131]" />
            <span className="size-2.5 rounded-full bg-[#313131]" />
            <span className="size-2.5 rounded-full bg-[#6f00ff]" />
            <span className="ml-3 text-xs text-[#8C8C8C]">agent config</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-[#B7B7B7]">
            {codeSample}
          </pre>
        </div>
      </div>
    </section>
  );
}
