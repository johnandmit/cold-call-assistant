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

  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // Process in chunks to avoid call stack overflow on large files
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  const payload = {
    filename,
    file: base64,
    mimeType: blob.type || 'audio/wav',
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow', // Apps Script redirects on POST
  });

  if (!response.ok) {
    throw new Error(`Drive upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Drive upload failed: ${data.error || 'Unknown error'}`);
  }

  return data.url || `https://drive.google.com/file/d/${data.fileId}/view`;
}
