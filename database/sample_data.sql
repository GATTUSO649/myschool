USE cresent_high_school_portal;

INSERT INTO students (name, username, email, admission_number, role, class_name, subject, stream, active)
VALUES
  ('Demo Student', 'student', 'student@cresent.local', 'CRES/001/2026', 'student', 'Form 1', NULL, 'A', 1),
  ('Demo Lecturer', 'Mathematics', 'lecturer@cresent.local', 'STAFF/001', 'lecturer', NULL, 'Mathematics', NULL, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), username = VALUES(username), subject = VALUES(subject);

INSERT INTO exams (title, subject, class_name, exam_date, start_time, end_time, venue)
VALUES
  ('Term 1 Mathematics CAT', 'Mathematics', 'Form 1', CURDATE(), '09:00:00', '10:30:00', 'Main Hall')
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO calendar_events (title, description, event_date, type, class_name)
VALUES
  ('Opening Assembly', 'Whole school opening assembly', CURDATE(), 'assembly', NULL)
ON DUPLICATE KEY UPDATE title = VALUES(title);
