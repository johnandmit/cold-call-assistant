import { getSettings } from '@/lib/storage';

export async function uploadToDrive(blob: Blob, filename: string): Promise<string> {
  const settings = getSettings();
  if (!settings.driveConnected || !settings.driveToken) {
    throw new Error('Google Drive not connected');
  }

  const metadata: Record<string, any> = {
    name: filename,
    mimeType: blob.type || 'audio/webm',
  };

  if (settings.driveFolderId) {
    metadata.parents = [settings.driveFolderId];
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.driveToken}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive upload failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
}
