import type { ImageQuality } from '@/lib/image-compression';
import { compressImages } from '@/lib/image-compression';
import { getGitHubEmojis } from '@/lib/emoji-data';
import { log } from '@/lib/log';
import { toast } from 'sonner';

const shortcodeRegex = /:([a-zA-Z0-9_+-]+):/g;

export const attachmentKeywords = [
  'attachment',
  'attached',
  'attaching',
  'see the file',
  'see the files',
];

export async function processComposerAttachments(
  files: File[],
  quality: ImageQuality,
  showToast: boolean,
): Promise<File[]> {
  if (files.length === 0) return [];

  try {
    const compressedFiles = await compressImages(files, {
      quality,
      maxWidth: 1920,
      maxHeight: 1080,
    });

    if (compressedFiles.length !== files.length) {
      log.warn('Compressed files array length mismatch:', {
        original: files.length,
        compressed: compressedFiles.length,
      });
      if (showToast) toast.error('Image compression failed, using original files');
      return files;
    }

    if (showToast && quality !== 'original') {
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;

      files.forEach((originalFile, index) => {
        if (originalFile.type.startsWith('image/') && compressedFiles[index]) {
          totalOriginalSize += originalFile.size;
          totalCompressedSize += compressedFiles[index].size;
        }
      });

      if (totalOriginalSize > totalCompressedSize) {
        const savings = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100;
        if (savings > 0.1) toast.success(`Images compressed: ${savings.toFixed(1)}% smaller`);
      }
    }

    return compressedFiles;
  } catch (error) {
    log.error('Error compressing images:', error);
    if (showToast) toast.error('Image compression failed, using original files');
    return files;
  }
}

export function replaceEmojiShortcodes(text: string): string {
  if (!text.trim().length || !text.includes(':')) return text;
  return text.replace(shortcodeRegex, (match, shortcode): string => {
    const emoji = getGitHubEmojis().find(
      (entry) => entry.shortcodes.includes(shortcode) || entry.name === shortcode,
    );
    return emoji?.emoji ?? match;
  });
}
