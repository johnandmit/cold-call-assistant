import { getSettings } from '@/lib/storage';
import { SignJWT, importPKCS8 } from 'jose';

// Cache the token to prevent requesting a new one on every upload within the hour
let cachedSaToken = '';
let cachedSaTokenExpiry = 0;

async function getServiceAccountToken(serviceAccountStr: string): Promise<string> {
  let credentials;
  try {
    credentials = JSON.parse(serviceAccountStr);
  } catch (e) {
    throw new Error('Invalid Service Account JSON');
  }

  // Fast path if we have a valid cached token
  if (cachedSaToken && Date.now() < cachedSaTokenExpiry) {
    return cachedSaToken;
  }

  const { client_email, private_key, token_uri } = credentials;
  if (!client_email || !private_key) {
    throw new Error('Missing client_email or private_key in Service Account JSON');
  }

  // Import the PKCS8 private key using jose
  const privateKey = await importPKCS8(private_key, 'RS256');

  // Sign a JWT
  const jwt = await new SignJWT({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: token_uri || 'https://oauth2.googleapis.com/token',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  // Exchange JWT for an access token
  const response = await fetch(token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to obtain access token: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  
  cachedSaToken = data.access_token;
  // Cache for 55 minutes to be safe
  cachedSaTokenExpiry = Date.now() + 55 * 60 * 1000;
  
  return data.access_token;
}

export async function uploadToDrive(blob: Blob, filename: string): Promise<string> {
  const settings = getSettings();
  const serviceAccountStr = settings.serviceAccountJson || import.meta.env.VITE_SERVICE_ACCOUNT_JSON;
  
  let accessToken = '';

  if (serviceAccountStr) {
    accessToken = await getServiceAccountToken(serviceAccountStr);
  } else if (settings.driveConnected && settings.driveToken) {
    accessToken = settings.driveToken;
  } else {
    throw new Error('Google Drive not connected (No Service Account or OAuth Token)');
  }

  const metadata: Record<string, any> = {
    name: filename,
    mimeType: blob.type || 'audio/mp3',
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
        Authorization: `Bearer ${accessToken}`,
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
