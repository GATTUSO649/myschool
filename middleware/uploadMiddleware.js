const path = require('path');
const multer = require('multer');

function makeUploader(folder) {
  const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', folder),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  });

  return multer({ storage });
}

module.exports = {
  documentsUpload: makeUploader('documents'),
  assignmentsUpload: makeUploader('assignments'),
  studentsUpload: makeUploader('students'),
  profilePhotoUpload: makeUploader('profile_photos')
};
