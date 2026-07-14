import { Figma, X } from '@/components/icons/icons';
import { motion } from 'motion/react';

export function FeatureCardSearch() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl md:h-96">
        <div className="absolute left-0 top-0 aspect-square w-full rounded-2xl bg-[#2B2B2B] md:h-96 md:w-96" />
        <div className="bg-panelDark absolute left-[34px] top-[34px] inline-flex w-[600px] flex-col items-start justify-start overflow-hidden rounded-xl">
          <div className="bg-tokens-surface-secondary border-tokens-stroke-light/5 inline-flex h-12 items-center justify-center gap-3 self-stretch overflow-hidden border-b-[0.50px] px-4 py-3">
            <div className="flex h-6 items-center justify-center overflow-hidden rounded bg-[#262626] pl-1 pr-1.5">
              <X className="relative h-3.5 w-3.5 overflow-hidden fill-[#767676]" />
              <div className="flex items-center justify-center gap-2.5 px-0.5 text-[#767676]">esc</div>
            </div>
            <div className="flex flex-1 items-center justify-start gap-1">
              <div className="relative w-px self-stretch rounded-full bg-[#767676]" />
              <div className="flex-1 justify-center text-sm font-normal leading-none text-[#767676]">
                Search by sender, subject, or content...
              </div>
            </div>
          </div>
          <div className="bg-tokens-surface-secondary border-tokens-stroke-light/5 flex flex-col items-start justify-start self-stretch overflow-hidden border-b-[0.50px]">
            <div className="inline-flex items-center justify-start gap-1.5 self-stretch px-5 pb-3 pt-5">
              <div className="flex-1 justify-start text-sm leading-none text-[#8C8C8C]">
                Recently interacted
              </div>
            </div>
            <div className="flex flex-col items-start justify-start gap-2 self-stretch p-2">
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                <div className="relative h-8 w-8 rounded-full bg-indigo-500/10">
                  <div className="absolute left-[10.2px] top-[4px] h-7 w-3 overflow-hidden">
                    <img
                      src="/stripe.svg"
                      alt="Stripe"
                      width={12}
                      height={24}
                      className="w-18 absolute h-6"
                    />
                  </div>
                </div>
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Stripe
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
                      Mar 29
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                    <div className="flex-1 justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                      Payment confirmation #1234
                    </div>
                    <div className="flex items-start justify-start gap-1">
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                <div className="relative h-8 w-8 rounded-full bg-red-600/10">
                  <div className="absolute left-0 top-0 h-8 w-8 rounded-full" />
                  <div className="absolute left-[11px] top-[4px] h-7 w-2.5">
                    <img
                      src="/netflix.svg"
                      alt="Stripe"
                      width={12}
                      height={24}
                      className="w-18 absolute h-6"
                    />
                  </div>
                </div>
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Netflix
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
                      Mar 29
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                    <div className="flex-1 justify-start text-sm font-normal leading-none text-[#8C8C8C]">
                      New shows added to your list
                    </div>
                    <div className="flex items-start justify-start gap-1">
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-[10px] bg-[#202020] p-3">
                <img
                  className="h-8 w-8 rounded-full"
                  src="/dudu.jpg"
                  alt="Dudu"
                  width={32}
                  height={32}
                />
                <div className="inline-flex h-9 flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Dudu
                        </div>
                        <div className="justify-start text-center text-sm leading-none text-[#8C8C8C]">
                          [9]
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
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
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                <div className="inline-flex h-8 w-8 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-full bg-[#2B2B2B]">
                  <div className="relative h-8 w-8 overflow-hidden">
                    <div className="absolute left-[10.60px] top-[8px] h-4 w-2.5 overflow-hidden">
                      <Figma className="relative h-4 w-2.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Figma
                        </div>
                        <div className="justify-start text-center text-sm leading-none text-[#8C8C8C]">
                          [5]
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
                      Mar 26
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                    <div className="text-base-gray-500/50 flex-1 justify-start text-sm font-normal leading-none">
                      Comments on "Landing Page v2"
                    </div>
                    <div className="flex items-start justify-start gap-1">
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                <div className="inline-flex h-8 w-8 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-full bg-red-500/10 px-1.5 py-2.5">
                  <div className="relative h-8 w-8 overflow-hidden">
                    <div className="absolute left-[7.30px] top-[7px] h-4 w-4 overflow-hidden">
                      <div className="absolute left-0 top-0 h-4 w-4 bg-red-500" />
                    </div>
                  </div>
                </div>
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Asana
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
                      Mar 25
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                    <div className="text-base-gray-500/50 flex-1 justify-start text-sm font-normal leading-none">
                      Weekly task summary
                    </div>
                    <div className="flex items-start justify-start gap-1">
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-3 self-stretch rounded-lg p-3">
                <div className="relative inline-flex h-8 w-8 flex-col items-center justify-center gap-2.5 rounded-full px-1.5 py-2.5">
                  <div className="bg-base-primary-500 outline-tokens-surface-secondary absolute left-[24px] top-[24px] h-2 w-2 rounded-full outline outline-2" />
                </div>
                <div className="inline-flex flex-1 flex-col items-start justify-start gap-2.5">
                  <div className="inline-flex items-start justify-start gap-2.5 self-stretch">
                    <div className="flex flex-1 items-center justify-start gap-3">
                      <div className="flex items-center justify-start gap-1">
                        <div className="text-base-gray-950 justify-start text-sm leading-none">
                          Nick
                        </div>
                      </div>
                    </div>
                    <div className="text-base-gray-500/50 justify-start text-sm font-normal leading-none">
                      Mar 28
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-start gap-2.5 self-stretch">
                    <div className="text-base-gray-500/50 flex-1 justify-start text-sm font-normal leading-none">
                      Coffee next week?
                    </div>
                    <div className="flex items-start justify-start gap-1">
                      <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="inline-flex items-center justify-between self-stretch overflow-hidden">
            <div className="border-tokens-stroke-light/5 flex h-12 flex-1 items-center justify-center gap-2 border-r-[0.50px]">
              <div className="bg-tokens-button-surface/10 flex h-5 items-center justify-center overflow-hidden rounded px-1.5">
                <div className="bg-base-gray-500/50 h-2 w-3" />
              </div>
              <div className="text-base-gray-500/50 justify-start text-sm leading-none">Open</div>
            </div>
            <div className="border-tokens-stroke-light/5 flex h-12 flex-1 items-center justify-center gap-2 border-r-[0.50px]">
              <div className="bg-tokens-button-surface/10 flex h-5 items-center justify-center overflow-hidden rounded px-1">
                <div className="text-base-gray-500/50 justify-start text-center text-sm leading-none">
                  ⌘R
                </div>
              </div>
              <div className="text-base-gray-500/50 justify-start text-sm leading-none">Reply</div>
            </div>
            <div className="border-tokens-stroke-light/5 flex h-12 flex-1 items-center justify-center gap-2 border-r-[0.50px]">
              <div className="bg-tokens-button-surface/10 flex h-5 items-center justify-center overflow-hidden rounded px-1">
                <div className="text-base-gray-500/50 justify-start text-center text-sm leading-none">
                  ⌘E
                </div>
              </div>
              <div className="text-base-gray-500/50 justify-start text-sm leading-none">
                Archive
              </div>
            </div>
            <div className="border-tokens-stroke-light/5 flex h-12 flex-1 items-center justify-center gap-2 border-r-[0.50px]">
              <div className="bg-tokens-button-surface/10 flex h-5 items-center justify-center overflow-hidden rounded px-1">
                <div className="text-base-gray-500/50 justify-start text-center text-sm leading-none">
                  ⌘M
                </div>
              </div>
              <div className="text-base-gray-500/50 justify-start text-sm leading-none">
                Mark read
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <h1 className="mb-2 text-lg font-medium leading-loose text-white">Smart Search</h1>
        <p className="max-w-sm text-sm font-light text-[#979797]">
          Your inbox, your rules. Create personalized email processing flows that match exactly how
          you organize,write, reply, and work.
        </p>
      </div>
    </motion.div>
  );
}
