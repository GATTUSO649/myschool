const path = require('path');
const multer = require('multer');
const fs = require('fs');

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain'
]);

const allowedExtensions = new Set(['.pdf', '.xls', '.xlsx', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.txt']);

function ensureFolder(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function makeUploader(folder) {
  const folderPath = path.join(__dirname, '..', 'uploads', folder);
  ensureFolder(folderPath);

  const storage = multer.diskStorage({
    destination: folderPath,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const isAllowed = allowedMimeTypes.has(file.mimetype) && allowedExtensions.has(ext);
      if (!isAllowed) {
        return cb(new Error('Unsupported file type'));
      }
      cb(null, true);
    }
  });
}

module.exports = {
  documentsUpload: makeUploader('documents'),
  assignmentsUpload: makeUploader('assignments'),
  studentsUpload: makeUploader('students'),
  profilePhotoUpload: makeUploader('profile_photos')
};
