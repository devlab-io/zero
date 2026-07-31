import {
  Bell,
  Check,
  ExclamationTriangle,
  Filter,
  GroupPeople,
  Lightning,
  PanelLeftOpen,
  Search,
  Tag,
  User,
} from '@/components/icons/icons';
import { productBrand } from '@/lib/brand';
import { motion } from 'motion/react';

export function FeatureCardInterface() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl md:h-96">
        <div className="absolute left-0 top-0 aspect-square w-full rounded-2xl border border-[#252525] bg-neutral-800 md:h-96 md:w-96" />
        <div className="outline-tokens-stroke-light/5 bg-panelDark absolute left-1/2 top-[34px] inline-flex h-[771px] w-72 -translate-x-1/2 flex-col items-start justify-start overflow-hidden rounded-lg">
          <div className="inline-flex h-10 items-center justify-start gap-3 self-stretch overflow-hidden border-b-[0.38px] border-[#252525] px-4 py-5">
            <div className="flex flex-1 items-center justify-start gap-2">
              <div className="flex flex-1 items-center justify-start gap-1.5">
                <PanelLeftOpen className="h-3 w-3 fill-[#8C8C8C]" />
                <div className="ml-1 justify-start text-xs leading-3 text-white">Inbox</div>
              </div>
            </div>
            <div className="flex items-center justify-start gap-1">
              <Check className="h-2.5 w-2.5 fill-[#8C8C8C]" />
              <div className="justify-start text-xs leading-3 text-[#8C8C8C]">Select</div>
            </div>
            <div className="relative h-2.5 w-[0.76px] rounded-full bg-[#252525]" />
            <div className="flex items-center justify-start gap-2">
              <Filter className="relative h-3 w-3 fill-[#8C8C8C]" />
            </div>
          </div>
          <div className="flex flex-col items-start justify-start gap-3 self-stretch p-4">
            <div className="inline-flex h-7 items-center justify-start gap-1 self-stretch overflow-hidden rounded bg-[#141414] pl-1.5 pr-[3.04px]">
              <Search className="relative mr-1 h-3 w-3 overflow-hidden rounded-[1.14px] fill-[#8C8C8C]" />
              <div className="flex-1 justify-start text-xs leading-3 text-[#929292]">Search</div>
              <div className="flex h-5 items-center justify-center gap-2 rounded-sm bg-[#262626] px-1">
                <div className="justify-start text-xs leading-3 text-[#929292]">⌘K</div>
              </div>
            </div>
            <div className="inline-flex items-start justify-start gap-1.5 self-stretch">
              <div className="flex h-6 w-6 items-center justify-center gap-[3.04px] overflow-hidden rounded bg-[#313131]">
                <Lightning className="relative h-3 w-3 overflow-hidden fill-[#989898]" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center gap-[3.04px] overflow-hidden rounded bg-[#313131]">
                <ExclamationTriangle className="relative h-3.5 w-3.5 overflow-hidden fill-[#989898]" />
              </div>
              <div className="flex h-6 flex-1 items-center justify-center gap-[3.04px] overflow-hidden rounded bg-[#39AE4A] px-2.5">
                <User className="relative h-3 w-3 overflow-hidden fill-white" />
                <div className="flex items-center justify-center gap-2 px-[1.52px]">
                  <div className="justify-start text-xs leading-3 text-white">Personal</div>
                </div>
              </div>
              <div className="flex h-6 w-6 items-center justify-center gap-[3.04px] overflow-hidden rounded bg-[#313131]">
                <Bell className="relative h-3 w-3 overflow-hidden fill-[#989898]" />
              </div>
              <div className="flex h-6 w-6 items-center justify-center gap-[3.04px] overflow-hidden rounded bg-[#313131]">
                <Tag className="relative h-3 w-3 overflow-hidden fill-[#989898]" />
              </div>
            </div>
            <div className="relative flex flex-col items-start justify-center gap-2.5 self-stretch overflow-hidden rounded-md bg-[#12341D] px-2 py-2.5">
              <div className="justify-start self-stretch text-xs leading-3 text-[#A3E1B3]">
                Security, Deadlines, and Urgent Updates
              </div>
              <div className="justify-start self-stretch text-xs font-normal leading-none text-[#F4FBF6]">
                Time-sensitive notifications, security alerts, <br />
                and critical project updates.
              </div>
              <div className="absolute left-[239.80px] top-[6.07px] h-3 w-3 overflow-hidden opacity-50" />
            </div>
          </div>
          <div className="inline-flex items-center justify-start gap-1 self-stretch px-4 pb-3 pt-5">
            <div className="flex flex-1 items-center justify-start gap-1">
              <div className="justify-start text-xs leading-3 text-[#8C8C8C]">Pinned</div>
              <div className="justify-start text-xs leading-3 text-[#8C8C8C]">[3]</div>
            </div>
          </div>
          <div className="flex flex-col items-start justify-start gap-1.5 self-stretch px-1.5">
            <div className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-md p-2.5">
              <img
                alt="Nizzy"
                height={250}
                width={250}
                className="h-6 w-6 rounded-full object-cover"
                src="/nizzy.webp"
              />
              <div className="inline-flex h-7 flex-1 flex-col items-start justify-start gap-2">
                <div className="inline-flex items-start justify-start gap-2 self-stretch">
                  <div className="flex flex-1 items-center justify-start gap-2.5">
                    <div className="flex items-center justify-start gap-[3.04px]">
                      <div className="text-base-gray-950 justify-start text-xs leading-3">
                        Nizzy
                      </div>
                      <div className="justify-start text-center text-xs leading-3 text-[#8C8C8C]">
                        [9]
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-normal leading-3 text-[#8C8C8C]">Mar 29</div>
                </div>
                <div className="inline-flex items-center justify-start gap-2 self-stretch">
                  <div className="text-xs font-normal leading-3 text-[#8C8C8C]">
                    New design review
                  </div>
                  <div className="flex items-start justify-start gap-[3.04px]">
                    <div className="relative h-3.5 w-3.5 overflow-hidden" />
                  </div>
                </div>
              </div>
            </div>
            <div className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-lg p-2.5">
              <div className="inline-flex h-6 w-6 flex-col items-center justify-center gap-2 overflow-hidden rounded-full bg-[#313131] px-1 py-2">
                <GroupPeople className="relative h-5 w-5 overflow-hidden fill-[#989898]" />
              </div>
              <div className="inline-flex flex-1 flex-col items-start justify-start gap-2">
                <div className="inline-flex items-start justify-start gap-2 self-stretch">
                  <div className="flex flex-1 items-center justify-start gap-2.5">
                    <div className="flex items-center justify-start gap-1">
                      <div className="text-base-gray-950 justify-start text-xs leading-3">
                        Alex, Ali, Sarah
                      </div>
                      <div className="justify-start text-center text-xs leading-3 text-[#8C8C8C]">
                        [6]
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-normal leading-3 text-[#8C8C8C]">Mar 28</div>
                </div>
                <div className="inline-flex items-center justify-start gap-2 self-stretch">
                  <div className="text-xs font-normal leading-3 text-[#8C8C8C]">
                    Re: Design review feedback
                  </div>
                  <div className="flex items-start justify-start gap-[3.04px]">
                    <div className="relative h-3.5 w-3.5 overflow-hidden" />
                    <div className="relative h-3.5 w-3.5 overflow-hidden" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 gap-4">
        <h1 className="mb-2 text-xl font-medium leading-loose text-zinc-950 dark:text-white">
          Lightning-Fast Interface
        </h1>
        <p className="max-w-sm text-sm font-light text-zinc-600 dark:text-[#979797]">
          Opening, moving, replying and scrolling feel immediate. {productBrand.name} stays out of
          your way, so the inbox never slows you down.
        </p>
      </div>
    </motion.div>
  );
}
