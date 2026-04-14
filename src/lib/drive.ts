import { getSettings } from '@/lib/storage';

/**
 * Default Apps Script Web App URL.
 * Set this after deploying the Google Apps Script as a Web App.
 * The URL looks like: https://script.google.com/macros/s/XXXXXXXXX/exec
 */
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwqfijZGTeBYMo91lYzyJcZlwem2hoAZqIPp97rybOf-v3IbAdKeS44Cu61UhNLiGQoKg/exec';

/**
 * Upload an audio blob to Google Drive via a Google Apps Script web app.
 * 
 * This avoids all OAuth complexity — the Apps Script runs as YOUR Google account
 * and has full permission to write to your Drive. The recording is sent as base64
 * in a POST request to the deployed web app URL.
 */
export async function uploadToDrive(blob: Blob, filename: string): Promise<string> {
  const settings = getSettings();
  const webhookUrl = settings.driveWebhookUrl || DEFAULT_APPS_SCRIPT_URL;

  if (!webhookUrl) {
    throw new Error('Google Drive webhook URL not configured. Deploy the Apps Script and paste the URL in Settings.');
  }

  // Convert blob to base64 using FileReader (more robust for larger files)
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const payload = {
    filename,
    file: base64,
    mimeType: blob.type || 'audio/wav',
  };

  // We use text/plain to avoid CORS preflight (OPTIONS request).
  // Google Apps Script doesn't handle OPTIONS well but will happily parse the JSON body 
  // from our text/plain POST request.
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Server-side error');
    }

    return data.url || `https://drive.google.com/file/d/${data.fileId}/view`;
  } catch (err: any) {
    console.error('Fetch error during Drive upload:', err);
    if (err.message === 'Failed to fetch') {
      throw new Error('Connection failed. This is usually a Google script permission or CORS issue. Ensure the script is deployed to "Anyone".');
    }
    throw err;
  }
}
