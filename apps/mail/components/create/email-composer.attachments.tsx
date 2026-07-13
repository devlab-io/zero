import { m } from '@/paraglide/messages';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ImageCompressionSettings } from './image-compression-settings';
import type { ImageQuality } from '@/lib/image-compression';
import { Paperclip, X as XIcon } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import pluralize from 'pluralize';
import { toast } from 'sonner';

// Attachments popover, extracted verbatim from email-composer.tsx (behaviour
// unchanged); closures are passed as props.

interface ComposerAttachmentsProps {
  attachments?: File[];
  imageQuality: ImageQuality;
  onQualityChange: (quality: ImageQuality) => void;
  onRemove: (index: number) => Promise<void>;
}

export function ComposerAttachments({
  attachments,
  imageQuality,
  onRemove,
  onQualityChange,
}: ComposerAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <Popover modal={true}>
                <PopoverTrigger asChild>
                  <button
                    className="focus-visible:ring-ring flex items-center gap-1.5 rounded-md border border-[#E7E7E7] bg-white/5 px-2 py-1 text-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-[#2B2B2B] cursor-pointer"
                    aria-label={`View ${attachments.length} attached ${pluralize('file', attachments.length)}`}
                  >
                    <Paperclip className="h-3.5 w-3.5 text-[#9A9A9A]" />
                    <span className="font-medium">{attachments.length}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-100 w-[340px] rounded-lg p-0 shadow-lg dark:bg-[#202020]"
                  align="start"
                  sideOffset={6}
                >
                  <div className="flex flex-col">
                    <div className="border-b border-[#E7E7E7] p-3 dark:border-[#2B2B2B]">
                      <h4 className="text-sm font-semibold text-black dark:text-white/90">
                        Attachments
                      </h4>
                      <p className="text-muted-foreground text-xs dark:text-[#9B9B9B]">
                        {pluralize('file', attachments.length, true)}
                      </p>
                    </div>

                    <div className="border-b border-[#E7E7E7] p-3 dark:border-[#2B2B2B]">
                      <ImageCompressionSettings
                        quality={imageQuality}
                        onQualityChange={onQualityChange}
                        className="border-0 shadow-none"
                      />
                    </div>

                    <div className="max-h-[250px] flex-1 space-y-0.5 overflow-y-auto p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {attachments.map((file: File, index: number) => {
                        const nameParts = file.name.split('.');
                        const extension = nameParts.length > 1 ? nameParts.pop() : undefined;
                        const nameWithoutExt = nameParts.join('.');
                        const maxNameLength = 22;
                        const truncatedName =
                          nameWithoutExt.length > maxNameLength
                            ? `${nameWithoutExt.slice(0, maxNameLength)}…`
                            : nameWithoutExt;
                        return (
                          <div
                            key={file.name + index}
                            className="group flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#F0F0F0] dark:bg-[#2C2C2C]">
                                {file.type.startsWith('image/') ? (
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    className="h-full w-full rounded object-cover"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <span className="text-sm" aria-hidden="true">
                                    {file.type.includes('pdf')
                                      ? '📄'
                                      : file.type.includes('excel') ||
                                          file.type.includes('spreadsheetml')
                                        ? '📊'
                                        : file.type.includes('word') ||
                                            file.type.includes('wordprocessingml')
                                          ? '📝'
                                          : '📎'}
                                  </span>
                                )}
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <p
                                  className="flex items-baseline text-sm text-black dark:text-white/90"
                                  title={file.name}
                                >
                                  <span className="truncate">{truncatedName}</span>
                                  {extension && (
                                    <span className="ml-0.5 shrink-0 text-[10px] text-[#8C8C8C] dark:text-[#9A9A9A]">
                                      .{extension}
                                    </span>
                                  )}
                                </p>
                                <p className="text-muted-foreground text-xs dark:text-[#9B9B9B]">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                                e.preventDefault();
                                e.stopPropagation();

                                try {
                                  await onRemove(index);
                                } catch (error) {
                                  console.error('Failed to remove attachment:', error);
                                  toast.error(m['pages.createEmail.failedToRemoveAttachment']());
                                }
                              }}
                              className="focus-visible:ring-ring ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 cursor-pointer"
                              aria-label={`Remove ${file.name}`}
                            >
                              <XIcon className="text-muted-foreground h-3.5 w-3.5 hover:text-black dark:text-[#9B9B9B] dark:hover:text-white" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
  );
}
