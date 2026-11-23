import { fileName, type TransferFile } from '../transfer';

// Saving and sharing export files. "Download" saves a .json file; "Share" opens the device's share
// sheet (WhatsApp, Drive, email…) where the browser supports sharing files (mostly phones).

function jsonFile(name: string, text: string, type = 'application/json'): File {
  return new File([text], name, { type });
}

export function downloadFile(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
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
export async function shareFile(name: string, text: string, type = 'application/json'): Promise<boolean> {
  try {
    await navigator.share({ files: [jsonFile(name, text, type)], title: name });
    return true;
  } catch {
    return false;
  }
}

/**
 * True in the app installed to an iPhone or iPad home screen, where a normal download often just
 * opens the file instead of saving it (navigator.standalone only exists on iOS/iPadOS).
 */
export function isIosHomeScreenApp(): boolean {
  return typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true;
}

/** Saves an export file (download) or opens the share sheet. Returns a short message for the screen. */
export async function deliverFile(file: TransferFile, share: boolean): Promise<string> {
  const name = fileName(file);
  const text = JSON.stringify(file);
  // On the iPhone/iPad home screen app, saving goes through the share sheet ("Save to Files").
  if (share || (isIosHomeScreenApp() && canShareFiles())) return (await shareFile(name, text)) ? 'Shared.' : '';
  downloadFile(name, text);
  return `Saved ${name}.`;
}

/** Saves (or shares) a plain-text file, such as a problem report. Returns a short message for the screen. */
export async function deliverText(name: string, text: string, share: boolean): Promise<string> {
  if (share || (isIosHomeScreenApp() && canShareFiles())) return (await shareFile(name, text, 'text/plain')) ? 'Shared.' : '';
  downloadFile(name, text, 'text/plain');
  return `Saved ${name}.`;
}

/** Copies text to the clipboard. Returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or no permission: the old way, with a hidden text box.
    try {
      const box = document.createElement('textarea');
      box.value = text;
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand('copy');
      box.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
