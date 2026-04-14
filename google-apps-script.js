const FOLDER_ID = '1XBCndWW87aMn3awjocvE8tOtdyGhjw9X';

// This is what the browser sees when you visit the link (for testing)
function doGet() {
  return ContentService.createTextOutput("✅ Drive Webhook is active and waiting for audio files!");
}

// This is what handles the actual audio uploads from the app
function doPost(e) {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const data = JSON.parse(e.postData.contents);
    const filename = data.filename || 'recording.wav';
    const base64Data = data.file;
    const mimeType = data.mimeType || 'audio/wav';
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, fileId: file.getId(), url: file.getUrl(), name: file.getName() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
