ALTER TABLE students
  MODIFY role ENUM('student', 'lecturer', 'teacher', 'rba', 'admin', 'school_admin', 'super_admin', 'finance', 'accountant', 'ict') NOT NULL DEFAULT 'student';

ALTER TABLE students ADD COLUMN finance_working_area VARCHAR(100) NULL;
ALTER TABLE students ADD COLUMN ict_working_area VARCHAR(100) NULL;