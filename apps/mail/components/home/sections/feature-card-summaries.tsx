import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Docx,
  Figma,
  ImageFile,
  X,
} from '@/components/icons/icons';
import { motion } from 'motion/react';

export function FeatureCardSummaries() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl md:h-96">
        <div className="absolute left-0 top-0 aspect-square w-full rounded-2xl bg-[#2B2B2B] md:h-96 md:w-96" />
        <div className="absolute left-[44px] top-0 h-[720px] w-[610px]">
          <div className="absolute left-[31px] top-[29px] inline-flex h-[720px] w-[547px] flex-col items-start justify-start overflow-hidden rounded-lg bg-[#202020] opacity-20">
            <div className="border-tokens-stroke-light/5 inline-flex h-9 items-center justify-between self-stretch overflow-hidden border-b-[0.35px] py-3 pl-3.5 pr-2">
              <div className="flex items-center justify-start gap-3">
                <X className="relative h-3 w-3 overflow-hidden fill-[#8C8C8C]" />
                <div className="relative h-2 w-[0.71px] rounded-full bg-[#2B2B2B]" />
                <div className="flex items-center justify-start gap-2">
                  <ChevronLeft className="relative h-3 w-3 overflow-hidden fill-[#8C8C8C]" />
                  <ChevronRight className="relative h-3 w-3 overflow-hidden fill-[#8C8C8C]" />
                </div>
              </div>
              <div className="flex items-center justify-start gap-2">
                <div className="bg-tokens-button-surface/10 flex h-5 w-5 items-center justify-center gap-[2.83px] overflow-hidden rounded">
                  <div className="relative h-4 w-4 overflow-hidden">
                    <div className="bg-base-warning-500 absolute left-[5.37px] top-[3.90px] h-2.5 w-1.5" />
                  </div>
                </div>
                <div className="bg-tokens-stroke-light/5 relative h-2 w-[0.71px] rounded-full" />
                <div className="bg-tokens-button-surface/10 flex h-5 items-center justify-center gap-[1.42px] overflow-hidden rounded px-1">
                  <div className="relative h-3 w-3" />
                  <div className="flex items-center justify-center gap-2 pl-[0.71px] pr-[1.42px]">
                    <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                      Reply all
                    </div>
                  </div>
                </div>
                <div className="bg-tokens-button-surface/10 flex h-5 w-5 items-center justify-center gap-[2.83px] overflow-hidden rounded">
                  <div className="relative h-3 w-3 overflow-hidden" />
                </div>
                <div className="bg-tokens-button-surface/10 flex h-5 w-5 items-center justify-center gap-[2.83px] overflow-hidden rounded">
                  <div className="relative h-3 w-3" />
                </div>
                <div className="bg-tokens-button-surface/10 flex h-5 w-5 items-center justify-center gap-[2.83px] overflow-hidden rounded">
                  <div className="relative h-3 w-3 overflow-hidden" />
                </div>
                <div className="bg-base-danger-100 outline-base-danger-200 flex h-5 w-5 items-center justify-center gap-[2.83px] overflow-hidden rounded outline outline-[0.35px]">
                  <div className="relative h-3 w-3 overflow-hidden" />
                </div>
              </div>
            </div>
            <div className="border-tokens-stroke-light/5 flex flex-col items-start justify-start gap-6 self-stretch overflow-hidden border-b-[0.35px] p-3.5">
              <div className="flex flex-col items-start justify-start gap-4 self-stretch">
                <div className="flex flex-col items-start justify-start gap-2.5 self-stretch">
                  <div className="inline-flex items-start justify-start gap-[2.83px] self-stretch">
                    <div className="text-base-gray-950 justify-start text-xs leading-3">
                      Re: Design review feedback
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-center text-xs leading-3">
                      [6]
                    </div>
                  </div>
                  <div className="inline-flex items-start justify-start gap-1 self-stretch">
                    <Calendar className="relative bottom-px h-2.5 w-2.5 overflow-hidden fill-[#8C8C8C]" />
                    <div className="text-base-gray-500/50 flex-1 justify-start text-[9.92px] font-normal leading-[9.92px]">
                      March 25 - March 29
                    </div>
                  </div>
                </div>
                <div className="inline-flex items-center justify-start gap-3">
                  <div className="flex items-center justify-start gap-1 overflow-hidden shadow-[0px_0.7086613774299622px_1.4173227548599243px_0px_rgba(255,255,255,0.00)] shadow-[0px_0px_0px_0.3543306887149811px_rgba(255,255,255,0.00)]">
                    <div className="flex items-center justify-start">
                      <div className="bg-base-success-500 outline-tokens-surface-secondary flex h-5 w-5 items-center justify-center gap-[2.83px] rounded px-2 outline outline-1">
                        <div className="relative h-3 w-3 overflow-hidden" />
                      </div>
                      <div className="bg-base-secondary-500 flex h-5 w-5 items-center justify-center gap-[2.83px] rounded px-2">
                        <div className="relative h-3 w-3 overflow-hidden" />
                      </div>
                    </div>
                    <div className="relative h-3 w-3 overflow-hidden" />
                  </div>
                  <div className="bg-tokens-stroke-light/5 relative h-2 w-[0.71px] rounded-full" />
                  <div className="flex items-center justify-start gap-[2.83px]">
                    <div className="outline-tokens-badge-default/10 flex items-center justify-start gap-1 overflow-hidden rounded-full py-[2.83px] pl-[2.83px] pr-2 outline outline-[0.35px] outline-offset-[-0.35px]">
                      <img
                        className="h-3.5 w-3.5 rounded-full px-[2.66px] py-1"
                        src="https://placehold.co/14x14"
                      />
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        Ali
                      </div>
                    </div>
                    <div className="outline-tokens-badge-default/10 flex items-center justify-start gap-1 overflow-hidden rounded-full py-[2.83px] pl-[2.83px] pr-2 outline outline-[0.35px] outline-offset-[-0.35px]">
                      <div className="inline-flex h-3.5 w-3.5 flex-col items-center justify-center gap-2 overflow-hidden rounded-full">
                        <img className="h-4 w-4" src="https://placehold.co/17x17" />
                      </div>
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        Nick
                      </div>
                    </div>
                    <div className="outline-tokens-badge-default/10 flex items-center justify-start gap-1 overflow-hidden rounded-full py-[2.83px] pl-[2.83px] pr-2 outline outline-[0.35px] outline-offset-[-0.35px]">
                      <img className="h-3.5 w-3.5 rounded-full" src="https://placehold.co/14x14" />
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        Sarah
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-tokens-surface-on-secondary/5 outline-base-secondary-500 flex flex-col items-start justify-start gap-3.5 self-stretch rounded-lg p-3 outline outline-[0.35px] outline-offset-[-0.35px]">
                <div className="inline-flex items-center justify-start gap-1">
                  <div className="justify-start text-[9.92px] leading-[9.92px] text-[#948CA4]">
                    AI Summary
                  </div>
                </div>
                <div className="text-base-gray-950 justify-start self-stretch text-[9.92px] font-normal leading-none">
                  Design review of new email client features. Team discussed command center
                  improvements and category system. General positive feedback, with suggestions for
                  quick actions placement.
                </div>
              </div>
              <div className="flex flex-col items-start justify-start gap-2.5 self-stretch">
                <div className="inline-flex items-center justify-start gap-[2.83px]">
                  <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                    Attachments
                  </div>
                  <div className="text-base-gray-500/50 justify-start text-center text-[9.92px] leading-[9.92px]">
                    [4]
                  </div>
                </div>
                <div className="inline-flex flex-wrap content-start items-start justify-start gap-2 self-stretch">
                  <div className="outline-tokens-stroke-element/0 flex h-5 items-center justify-start gap-1 overflow-hidden rounded bg-[#26232C] px-1.5 py-1 shadow">
                    <div className="relative overflow-hidden">
                      <Figma className="relative h-2 w-2 overflow-hidden" />
                    </div>
                    <div className="flex items-center justify-start gap-[2.83px]">
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        cmd.center.fig
                      </div>
                      <div className="justify-start text-[9.92px] leading-[9.92px] opacity-50">
                        21 MB
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-start gap-1 overflow-hidden rounded bg-[#26232C] py-1 pl-1 pr-1.5 shadow">
                    <Docx className="relative h-2 w-2 overflow-hidden fill-blue-500" />
                    <div className="flex items-center justify-start gap-[2.83px]">
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        comments.docx
                      </div>
                      <div className="justify-start text-[9.92px] leading-[9.92px] opacity-50">
                        3.7 MB
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-start gap-1 overflow-hidden rounded bg-[#26232C] py-1 pl-1 pr-1.5 shadow">
                    <ImageFile className="relative h-2 w-2 overflow-hidden fill-purple-500" />
                    <div className="flex items-center justify-start gap-[2.83px]">
                      <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                        img.png
                      </div>
                      <div className="justify-start text-[9.92px] leading-[9.92px] opacity-50">
                        2.3 MB
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-tokens-stroke-light/5 flex-col items-start justify-start gap-6 self-stretch overflow-hidden border-b-[0.35px] p-3.5">
              <div className="inline-flex items-center justify-start gap-3 self-stretch">
                <img
                  alt="Ahmet"
                  height={200}
                  width={200}
                  className="h-6 w-6 rounded-full"
                  src="/ahmet.jpg"
                />
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2">
                  <div className="inline-flex items-start justify-start gap-2 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-2">
                      <div className="flex items-center justify-start gap-[2.83px]">
                        <div className="text-base-gray-950 justify-start text-[9.92px] leading-[9.92px]">
                          Ahmet
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-[2.83px] self-stretch opacity-50">
                    <div className="text-base-gray-500/50 justify-start text-[9.92px] font-normal leading-[9.92px]">
                      To:
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-[9.92px] font-normal leading-[9.92px]">
                      Alex, Sarah
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="from-tokens-scroll-overlay-primary to-tokens-scroll-overlay-top/0 bg-linear-to-l absolute left-0 top-[668.98px] h-12 w-[547.09px]" />
            <div className="bg-tokens-agent-surface/10 border-tokens-agent-stroke absolute left-[498.90px] top-[674.65px] h-8 w-8 rounded-full border-2 px-1 shadow-[0px_8.503936767578125px_17.00787353515625px_0px_rgba(0,0,0,0.15)] backdrop-blur-lg" />
          </div>
          <div className="absolute left-0 top-[121px] inline-flex w-[650px] flex-col items-start justify-start gap-4 overflow-hidden rounded-3xl border border-[#8B5CF6] bg-[#2A1D48] p-6 outline outline-[#3F325F]">
            <div className="inline-flex items-center justify-start gap-1.5">
              <div className="relative h-3.5 w-3.5">
                <img src="/star.svg" alt="AI Summary" width={16} height={16} />
              </div>
              <div className="flex items-center justify-start gap-1 text-xs leading-3 text-[#948CA4]">
                AI Summary
                <ChevronDown className="relative h-2 w-2 overflow-hidden fill-[#8C8C8C]" />
              </div>
            </div>
            <div className="justify-start self-stretch text-base font-normal leading-snug text-white">
              Design review of new email client features. Team discussed command center improvements
              and{' '}
              <span className="text-[#D8C8FC]">
                category system. General positive feedback, with suggestions for quick actions
                placement.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <h1 className="mb-2 mt-4 text-lg font-medium leading-loose text-zinc-950 dark:text-white">
          AI on Your Terms
        </h1>
        <p className="max-w-sm text-sm font-light text-zinc-600 dark:text-[#979797]">
          Connect an MCP-compatible agent to Reta&apos;s draft-only surface, or use the inbox
          without an AI workflow. The model is your choice; the mailbox remains useful on its own.
        </p>
      </div>
    </motion.div>
  );
}
