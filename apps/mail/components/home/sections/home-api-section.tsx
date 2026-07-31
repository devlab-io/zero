import { productBrand } from '@/lib/brand';
import { motion } from 'motion/react';

const codeSample = `# ~/.codex/config.toml
[mcp_servers.reta]
url = "https://<your-reta-host>/mcp"

# Safe-by-default agent surface
listThreads · searchThreads · getThread
createDraft · enqueueDraftJob

# Sending remains a human action`;

const capabilities = [
  'Inspect and search threads through MCP',
  'Create drafts or reviewable outbox jobs',
  'No agent send, permanent delete or OAuth actions',
];

export function HomeApiSection() {
  return (
    <div className="relative mt-52">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-center"
      >
        <h1 className="text-lg font-light text-zinc-500 md:text-xl dark:text-white/40">
          API-first, MCP-native
        </h1>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-2 flex flex-col items-center justify-center md:mt-8"
      >
        <h1 className="text-center text-4xl font-medium text-zinc-950 md:text-6xl dark:text-white">
          A mailbox you can program
        </h1>
        <h1 className="mb-3 text-center text-4xl font-medium text-zinc-500 md:text-6xl dark:text-white/40">
          not a silo you rent
        </h1>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mx-auto mt-6 grid w-full max-w-[1100px] grid-cols-1 items-center gap-10 px-6 md:grid-cols-2 md:px-4"
      >
        <div className="flex flex-col items-start gap-5">
          <p className="max-w-md text-base font-normal leading-7 text-zinc-600 dark:text-[#B7B7B7]">
            {productBrand.name} exposes a documented, draft-only MCP surface for your tools and
            agents. Inspect threads, search mail and prepare replies without giving an agent the
            power to send, permanently delete or change account access.
          </p>
          <ul className="flex flex-col gap-3">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 dark:text-[#B7B7B7]"
              >
                <span className="size-1.5 rounded-full bg-[#6f00ff] dark:bg-[#c9afff]" />
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
      </motion.div>
    </div>
  );
}
