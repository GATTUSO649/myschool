const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    'English',
    'Kiswahili',
    'Mathematics',
    'Biology',
    'Physics',
    'Chemistry',
    'History and Government',
    'Geography',
    'Business Studies',
    'Computer Studies'
  ]);
});

module.exports = router;
