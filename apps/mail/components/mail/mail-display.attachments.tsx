import { m } from '@/paraglide/messages';
import type { Attachment } from '@/types';
import { Docx, Figma, ImageFile, PDF } from '../icons/icons';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

// Attachment helpers + thread-level attachments row, extracted verbatim from
// mail-display.tsx (behaviour unchanged).

export const formatFileSize = (size: number) => {
  const sizeInMB = (size / (1024 * 1024)).toFixed(2);
  return sizeInMB === '0.00' ? '' : `${sizeInMB} MB`;
};

export const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return <PDF className="fill-[#F43F5E]" />;
    case 'jpg':
      return <ImageFile />;
    case 'jpeg':
      return <ImageFile />;
    case 'png':
      return <ImageFile />;
    case 'gif':
      return <ImageFile />;
    case 'docx':
      return <Docx />;
    case 'fig':
      return <Figma />;
    case 'webp':
      return <ImageFile />;
    default:
      return <FileText className="h-4 w-4 text-[#8B5CF6]" />;
  }
};

export const downloadAttachment = async (attachment: {
  body: string;
  mimeType: string;
  filename: string;
  attachmentId: string;
}) => {
  try {
    const attachmentData = attachment.body;

    if (!attachmentData) {
      throw new Error('Attachment data not found');
    }

    const byteCharacters = atob(attachmentData);
    const byteNumbers: number[] = Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: attachment.mimeType });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    toast.error(m['common.mailDisplay.failedToDownloadAttachment']());
  }
};

export const handleDownloadAllAttachments =
  (subject: string, attachments: { body: string; mimeType: string; filename: string }[]) =>
  async () => {
    if (!attachments.length) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    console.log('attachments', attachments);
    attachments.forEach((attachment) => {
      try {
        const byteCharacters = atob(attachment.body);
        const byteNumbers: number[] = Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        zip.file(attachment.filename, byteArray, {
          binary: true,
          date: new Date(),
          unixPermissions: 0o644,
        });
      } catch (error) {
        console.error(`Error adding ${attachment.filename} to zip:`, error);
      }
    });

    // Generate and download the zip file
    zip
      .generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 9,
        },
      })
      .then((content) => {
        const url = window.URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `attachments-${subject || 'email'}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error('Error generating zip file:', error);
      });

    console.log('downloaded', subject, attachments);
  };

export const openAttachment = async (attachment: {
  body: string;
  mimeType: string;
  filename: string;
  attachmentId: string;
}) => {
  try {
    const attachmentData = attachment.body;

    if (!attachmentData) {
      throw new Error('Attachment data not found');
    }

    const byteCharacters = atob(attachmentData);
    const byteNumbers: number[] = Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: attachment.mimeType });
    const url = window.URL.createObjectURL(blob);

    const width = 800;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      url,
      'attachment-viewer',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,location=no,menubar=no`,
    );

    if (popup) {
      popup.focus();
      // Clean up the URL after a short delay to ensure the browser has time to load it
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    console.error('Error opening attachment:', error);
    toast.error(m['common.mailDisplay.failedToOpenAttachment']());
  }
};

export const ThreadAttachments = ({ attachments }: { attachments: Attachment[] }) => {
  if (!attachments || attachments.length === 0) return null;

  const handleDownload = async (attachment: Attachment) => {
    try {
      // Convert base64 to blob
      const byteCharacters = atob(attachment.body);
      const byteNumbers: number[] = Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.mimeType });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  return (
    <div className="mt-2 w-full">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          Thread Attachments <span className="text-[#8D8D8D]">[{attachments.length}]</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={`${attachment.attachmentId}-${attachment.filename}`}
            onClick={() => handleDownload(attachment)}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[#F0F0F0] dark:bg-[#262626] dark:hover:bg-[#303030]"
          >
            <span className="text-muted-foreground">{getFileIcon(attachment.filename)}</span>
            <span className="max-w-[200px] truncate" title={attachment.filename}>
              {attachment.filename}
            </span>
            <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
