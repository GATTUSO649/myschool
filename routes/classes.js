const express = require('express');
const { listClasses, getClassDetails, enrollStudent, getStudentsInClass, getCoursesByForm, getFormSummary, addCourse } = require('../controllers/classController');

const router = express.Router();

router.get('/summary', getFormSummary);
router.get('/form/:form/courses', getCoursesByForm);
router.post('/courses', addCourse);
router.post('/enroll', enrollStudent);
router.get('/:classId/students', getStudentsInClass);
router.get('/:classId', getClassDetails);
router.get('/', listClasses);

module.exports = router;

