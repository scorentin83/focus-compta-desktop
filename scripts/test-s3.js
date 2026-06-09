const path = require('path');
const fs = require('fs');

const {
  testS3Connection,
  uploadFileToS3,
  getSignedDownloadUrl,
  deleteObjectFromS3
} = require('../src/storage/s3Storage');

async function main() {
  console.log('Test connexion OVH S3...');

  const connection = await testS3Connection();
  console.log(connection);

  if (!connection.ok) {
    process.exit(1);
  }

  const testFilePath = path.join(__dirname, 'focus-compta-s3-test.txt');

  fs.writeFileSync(
    testFilePath,
    `Test Focus Compta S3 - ${new Date().toISOString()}`,
    'utf8'
  );

  console.log('Upload fichier test...');

  const upload = await uploadFileToS3(testFilePath, {
    companyId: 'test',
    type: 'diagnostics',
    filename: 'focus-compta-s3-test.txt',
    contentType: 'text/plain'
  });

  console.log(upload);

  console.log('Création URL temporaire...');

  const url = await getSignedDownloadUrl(upload.key, 300);
  console.log(url);

  console.log('Suppression fichier test...');

  const deletion = await deleteObjectFromS3(upload.key);
  console.log(deletion);

  fs.unlinkSync(testFilePath);

  console.log('Test OVH S3 terminé avec succès.');
}

main().catch(error => {
  console.error('Erreur test S3 :', error);
  process.exit(1);
});
