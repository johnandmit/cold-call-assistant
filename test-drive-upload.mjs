import { readFileSync } from 'fs';
import { SignJWT, importPKCS8 } from 'jose';

const SA_JSON = {
  // HIDDEN: This secret was blocked by GitHub. 
  // Please use a local environment variable or a separate config file.
  "type": "service_account",
  "project_id": "YOUR_PROJECT_ID",
  "private_key": "YOUR_PRIVATE_KEY",
  "client_email": "YOUR_CLIENT_EMAIL"
};

const FOLDER_ID = '1XBCndWW87aMn3awjocvE8tOtdyGhjw9X';

async function main() {
  console.log('=== Step 1: Import private key ===');
  const privateKey = await importPKCS8(SA_JSON.private_key, 'RS256');
  console.log('Private key imported OK');

  console.log('\n=== Step 2: Sign JWT ===');
  // Use broader scope to be sure
  const jwt = await new SignJWT({
    iss: SA_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: SA_JSON.token_uri,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  console.log('JWT signed OK, length:', jwt.length);

  console.log('\n=== Step 3: Exchange JWT for access token ===');
  const tokenRes = await fetch(SA_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('FAILED to get access token:', JSON.stringify(tokenData, null, 2));
    return;
  }
  console.log('Access token obtained OK, type:', tokenData.token_type, 'expires_in:', tokenData.expires_in);
  const accessToken = tokenData.access_token;

  // Test 1: Try uploading WITHOUT specifying a parent folder (to service account's own drive)
  console.log('\n=== Step 4: Test upload to service account root (no folder) ===');
  const boundary = '----FormBoundary' + Date.now();
  const metadata1 = JSON.stringify({ name: 'test-no-folder.txt', mimeType: 'text/plain' });
  const fileContent = 'Hello from Cold Call Assistant test! ' + new Date().toISOString();
  
  const body1 = 
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata1}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${fileContent}\r\n--${boundary}--`;
  
  const uploadRes1 = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body1,
    }
  );
  const uploadData1 = await uploadRes1.json();
  console.log('Upload to root - Status:', uploadRes1.status);
  console.log('Response:', JSON.stringify(uploadData1, null, 2));

  // Test 2: Try uploading WITH the target folder
  console.log('\n=== Step 5: Test upload to specific folder ===');
  const boundary2 = '----FormBoundary' + Date.now() + 'b';
  const metadata2 = JSON.stringify({ 
    name: 'test-with-folder.txt', 
    mimeType: 'text/plain',
    parents: [FOLDER_ID]
  });
  
  const body2 = 
    `--${boundary2}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata2}\r\n--${boundary2}\r\nContent-Type: text/plain\r\n\r\n${fileContent}\r\n--${boundary2}--`;
  
  const uploadRes2 = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary2}`,
      },
      body: body2,
    }
  );
  const uploadData2 = await uploadRes2.json();
  console.log('Upload to folder - Status:', uploadRes2.status);
  console.log('Response:', JSON.stringify(uploadData2, null, 2));

  // Test 3: List files to see what we have
  console.log('\n=== Step 6: List files in service account drive ===');
  const listRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=files(id,name,parents,webViewLink)',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const listData = await listRes.json();
  console.log('Files:', JSON.stringify(listData, null, 2));
}

main().catch(err => console.error('FATAL:', err));
