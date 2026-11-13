import { fileName, type TransferFile } from '../transfer';

// Saving and sharing export files. "Download" saves a .json file; "Share" opens the device's share
// sheet (WhatsApp, Drive, email…) where the browser supports sharing files (mostly phones).

function jsonFile(name: string, text: string): File {
  return new File([text], name, { type: 'application/json' });
}

export function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [jsonFile('test.json', '{}')] });
  } catch {
    return false;
  }
}

/** Opens the share sheet. Resolves false if the person cancelled or sharing failed. */
export async function shareFile(name: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [jsonFile(name, text)], title: name });
    return true;
  } catch {
    return false;
  }
}

/** Saves an export file (download) or opens the share sheet. Returns a short message for the screen. */
export async function deliverFile(file: TransferFile, share: boolean): Promise<string> {
  const name = fileName(file);
  const text = JSON.stringify(file);
  if (share) return (await shareFile(name, text)) ? 'Shared.' : '';
  downloadFile(name, text);
  return `Saved ${name}.`;
}
