import {
  CurvedArrow,
  Expand,
  GitHub,
  GroupPeople,
  PanelLeftOpen,
  Plus,
  X,
} from '@/components/icons/icons';
import { motion } from 'motion/react';

const firstRowQueries: string[] = [
  'Show recent design feedback',
  'Reply to Nick',
  'Find invoice from Stripe',
];

const secondRowQueries: string[] = [
  'Schedule meeting with Sarah',
  'What did alex say about the design',
];

export function HomeChatSection() {
  return (
    <div className="relative mt-52">
      <div className="z-1 relative w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center"
        >
          <h1 className="text-lg font-light text-zinc-500 md:text-xl dark:text-white/40">
            AI email chat with natural language
          </h1>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-2 flex flex-col items-center justify-center md:mt-8"
        >
          <h1 className="text-4xl font-medium text-zinc-950 md:text-6xl dark:text-white">
            Ask away
          </h1>
          <h1 className="mb-4 text-4xl font-medium text-zinc-500 md:text-6xl dark:text-white/40">
            Get your answers
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="relative flex w-full items-center justify-center"
        >
          <div className="relative mx-auto flex h-[587px] w-full max-w-[894px] items-center justify-center rounded-xl">
            <div className="absolute left-0 top-[319px] mx-auto inline-flex w-full max-w-[894px] flex-col items-start justify-start overflow-hidden rounded-xl bg-zinc-900 opacity-30">
              <div className="inline-flex items-center justify-start gap-1.5 self-stretch px-5 pb-4 pt-7">
                <div className="flex flex-1 items-center justify-start gap-1.5">
                  <div className="justify-start text-sm leading-none text-[#8C8C8C]">Pinned</div>
                  <div className="justify-start text-sm leading-none text-[#8C8C8C]">[3]</div>
                </div>
              </div>
              <div className="flex flex-col items-start justify-start gap-2 self-stretch px-2 pb-2">
                <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                  <img
                    src="/adam.jpg"
                    alt="avatar"
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                  <div className="inline-flex h-9 flex-1 flex-col items-start justify-start gap-2.5">
                    <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                      <div className="flex flex-1 items-center justify-start gap-3">
                        <div className="flex items-center justify-start gap-1">
                          <div className="text-base-gray-950 justify-start text-sm leading-none">
                            Adam from Zero
                          </div>
                          <div className="justify-start text-center text-sm leading-none text-[#8C8C8C]">
                            [9]
                          </div>
                        </div>
                      </div>
                      <div className="justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        Mar 29
                      </div>
                    </div>
                    <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                      <div className="flex-1 justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        New design review
                      </div>
                      <div className="flex items-start justify-start gap-1">
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-[10px] p-3">
                  <div className="inline-flex h-8 w-8 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-full bg-[#313131] px-1.5 py-2.5 shadow-[0px_0px_0px_0.5px_rgba(255,255,255,0.00)] shadow-[0px_1px_2px_0px_rgba(255,255,255,0.00)]">
                    <GroupPeople className="h-5 w-5 overflow-hidden fill-[#989898]" />
                  </div>
                  <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                    <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                      <div className="flex flex-1 items-center justify-start gap-3">
                        <div className="flex items-center justify-start gap-1.5">
                          <div className="text-base-gray-950 justify-start text-sm leading-none">
                            Alex, Ali, Sarah
                          </div>
                          <div className="justify-start text-center text-sm leading-none text-[#8C8C8C]">
                            [6]
                          </div>
                        </div>
                      </div>
                      <div className="justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        Mar 28
                      </div>
                    </div>
                    <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                      <div className="flex-1 justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        Re: Design review feedback
                      </div>
                      <div className="flex items-start justify-start gap-1">
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                  <div className="bg-tokens-surface-primary inline-flex h-8 w-8 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-full px-1.5 py-2.5">
                    <div className="relative h-fit">
                      <GitHub className="h-[25px] w-[25px] fill-white" />
                    </div>
                  </div>
                  <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                    <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                      <div className="flex flex-1 items-center justify-start gap-3">
                        <div className="flex items-center justify-start gap-1">
                          <div className="text-base-gray-950 justify-start text-sm leading-none">
                            GitHub
                          </div>
                          <div className="justify-start text-center text-sm leading-none text-[#8C8C8C]">
                            [8]
                          </div>
                        </div>
                      </div>
                      <div className="justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        Mar 28
                      </div>
                    </div>
                    <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                      <div className="flex-1 justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                        Security alert: Critical vulnerability
                      </div>
                      <div className="flex items-start justify-start gap-1">
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                        <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="aspect-96/125 absolute top-0 inline-flex w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-[#252525] md:h-[500px] md:w-96">
              <div className="border-tokens-stroke-light/5 inline-flex items-center justify-start gap-2 self-stretch overflow-hidden border-b-[0.50px] py-3.5 pl-5 pr-3.5">
                <div className="flex flex-1 items-center justify-start gap-3">
                  <div className="text-base-gray-950 flex flex-1 items-center justify-start text-sm leading-none">
                    <X className="mr-2 h-4 w-4 fill-[#8C8C8C]" />
                    New chat
                  </div>
                </div>
                <div className="flex h-6 items-center justify-center gap-0.5 overflow-hidden rounded-md px-1">
                  <Plus className="h-3 w-3 overflow-hidden fill-[#8C8C8C]" />
                </div>
                <div className="flex h-6 items-center justify-center gap-0.5 overflow-hidden rounded-md px-1">
                  <PanelLeftOpen className="h-3 w-3 overflow-hidden fill-[#8C8C8C]" />
                </div>
                <div className="flex h-6 items-center justify-center gap-0.5 overflow-hidden rounded-md px-1">
                  <Expand className="h-2.5 w-2.5 overflow-hidden fill-[#8C8C8C]" />
                </div>
              </div>
              <div className="relative flex h-full flex-1 flex-col items-center justify-between gap-8 self-stretch overflow-hidden px-5 py-4">
                <img src="/white-icon.svg" alt="chat" width={28} height={28} className="h-7 w-7" />
                <div className="flex flex-col items-center justify-start gap-3">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">
                    Ask anything about your emails
                  </div>
                  <div className="justify-start text-sm font-normal leading-none text-[#929292]">
                    Ask to do or show anything using natural language
                  </div>
                </div>
                <div className="relative inline-flex w-96 flex-col items-start justify-center gap-2">
                  {/* First row */}
                  <div className="no-scrollbar relative flex w-full justify-center">
                    <div className="flex items-center justify-start gap-2 whitespace-nowrap">
                      {firstRowQueries.map((query) => (
                        <div
                          key={query}
                          className="flex h-7 shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-md bg-[#303030] px-2 py-1.5"
                        >
                          <div className="flex items-center justify-start gap-1 px-0.5">
                            <div className="justify-start text-sm leading-none text-[#8B8B8B]">
                              {query}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-linear-to-l absolute left-0 top-0 h-7 w-12 from-neutral-800/0 to-neutral-800" />
                    <div className="bg-linear-to-l absolute right-0 top-0 h-7 w-12 from-neutral-800 to-neutral-800/0" />
                  </div>

                  {/* Second row */}
                  <div className="no-scrollbar relative flex w-full justify-center">
                    <div className="flex items-center justify-start gap-2 whitespace-nowrap">
                      {secondRowQueries.map((query) => (
                        <div
                          key={query}
                          className="flex h-7 shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-md bg-[#303030] px-2 py-1.5"
                        >
                          <div className="flex items-center justify-start gap-1 px-0.5">
                            <div className="justify-start text-sm leading-none text-[#8B8B8B]">
                              {query}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-linear-to-l absolute left-0 top-0 h-7 w-12 from-neutral-800/0 to-neutral-800" />
                    <div className="bg-linear-to-l absolute right-0 top-0 h-7 w-12 from-neutral-800 to-neutral-800/0" />
                  </div>
                </div>
                <div className="inline-flex w-full items-center justify-start gap-4 overflow-hidden p-0 md:w-96 md:p-4 md:pb-0">
                  <div className="flex h-8 flex-1 items-center justify-start gap-1.5 overflow-hidden rounded-md bg-[#141414] pl-2.5 pr-1">
                    <div className="relative h-3 w-px rounded-full bg-white" />
                    <div className="flex-1 justify-start text-sm leading-none text-[#727272]">
                      Ask Zero to do anything...
                    </div>
                    <div className="flex h-6 items-center justify-center gap-2.5 rounded bg-[#262626] px-1">
                      <CurvedArrow className="relative left-px mt-1 h-4 w-4 fill-black dark:fill-[#929292]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        <img
          src="/pixel.svg"
          alt="hero"
          width={1920}
          height={1080}
          className="z-2 relative bottom-24 rotate-180 bg-transparent opacity-0"
          style={{ clipPath: 'inset(45% 0 0 0)' }}
        />
      </div>
    </div>
  );
}
