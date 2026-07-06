-- ============================================================================
-- CRESENT HIGH SCHOOL MANAGEMENT SYSTEM - DATABASE SCHEMA
-- Optimized for Admin Dashboard with all necessary tables
-- ============================================================================

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  username VARCHAR(80) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','teacher','student','accountant','librarian') NOT NULL DEFAULT 'student',
  phone VARCHAR(40),
  avatar VARCHAR(255),
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
);

-- ============================================================================
-- ACADEMIC STRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS academic_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_name VARCHAR(50) UNIQUE NOT NULL,
  form INT NOT NULL COMMENT 'Form 1, 2, 3, or 4',
  capacity INT DEFAULT 50,
  class_teacher_id INT,
  academic_year_id INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_classes_form (form),
  INDEX idx_classes_year (academic_year_id),
  CONSTRAINT fk_classes_teacher FOREIGN KEY (class_teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_classes_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS class_streams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  stream_name VARCHAR(50) NOT NULL COMMENT 'Science, Arts, Commercial',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_stream (class_id, stream_name),
  CONSTRAINT fk_class_stream_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  form INT,
  stream VARCHAR(50),
  instructor_id INT,
  academic_year_id INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_courses_instructor (instructor_id),
  INDEX idx_courses_year (academic_year_id),
  CONSTRAINT fk_courses_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_courses_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
);

-- ============================================================================
-- STUDENTS & ENROLLMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  admission_number VARCHAR(50) UNIQUE NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  class_id INT,
  stream VARCHAR(50),
  category VARCHAR(50),
  boarding_status VARCHAR(50),
  parent_name VARCHAR(150),
  parent_phone VARCHAR(40),
  guardian_name VARCHAR(150),
  guardian_phone VARCHAR(40),
  address TEXT,
  emergency_contact VARCHAR(150),
  emergency_phone VARCHAR(40),
  medical_notes TEXT,
  admission_date DATE NOT NULL,
  status ENUM('active','inactive','graduated','withdrawn') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_admission (admission_number),
  INDEX idx_students_class (class_id),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS class_enrollment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream VARCHAR(50),
  enrollment_date DATE NOT NULL,
  status ENUM('active','transferred','graduated','dropped') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_class (student_id, class_id),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  enrollment_date DATE NOT NULL,
  status ENUM('active','completed','dropped') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_course (student_id, course_id),
  CONSTRAINT fk_student_course_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_course_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- ============================================================================
-- APPLICATIONS & ADMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(40),
  date_of_birth DATE,
  gender VARCHAR(20),
  previous_school VARCHAR(150),
  parent_name VARCHAR(150),
  parent_phone VARCHAR(40),
  address TEXT,
  applied_for_class VARCHAR(50),
  stream_preference VARCHAR(50),
  medical_notes TEXT,
  status ENUM('pending','approved','rejected','enrolled') DEFAULT 'pending',
  admission_number VARCHAR(50),
  reviewed_by INT,
  reviewed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applications_status (status),
  CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- ATTENDANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','late','excused') DEFAULT 'absent',
  recorded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_student (student_id),
  INDEX idx_attendance_date (date),
  UNIQUE KEY uniq_attendance (student_id, date),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- MARKS & RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  term INT,
  academic_year_id INT NOT NULL,
  marks DECIMAL(5,2),
  grade VARCHAR(5),
  exam_type VARCHAR(50) COMMENT 'Mid-term, Final, CAT',
  recorded_by INT,
  recorded_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_marks_student (student_id),
  INDEX idx_marks_course (course_id),
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_marks_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  term INT,
  academic_year_id INT NOT NULL,
  total_marks DECIMAL(7,2),
  average_grade VARCHAR(5),
  position INT,
  remarks TEXT,
  generated_by INT,
  generated_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_results_student (student_id),
  CONSTRAINT fk_results_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_results_generator FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- FINANCE & FEE MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS fee_structure (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  fee_type VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  term INT,
  due_date DATE,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fee_structure_class (class_id),
  CONSTRAINT fk_fee_structure_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_structure_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fee_charges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term INT,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE,
  status ENUM('pending','partial','paid') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fee_charges_student (student_id),
  CONSTRAINT fk_fee_charges_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_charges_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  receipt_number VARCHAR(80) UNIQUE NOT NULL,
  academic_year_id INT NOT NULL,
  term INT,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50),
  reference VARCHAR(120),
  remarks TEXT,
  recorded_by INT,
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fee_payments_student (student_id),
  INDEX idx_fee_payments_receipt (receipt_number),
  CONSTRAINT fk_fee_payments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_payments_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fee_statements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  total_fees DECIMAL(12,2),
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2),
  filename VARCHAR(255),
  generated_by INT,
  generated_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_statement_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_statement_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_statement_generator FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- DOCUMENTS & FILES
-- ============================================================================

DROP TABLE IF EXISTS transcripts;

CREATE TABLE IF NOT EXISTS form1_transcript (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  adm VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  stream VARCHAR(40),
  eng DECIMAL(5,2) NULL,
  kisw DECIMAL(5,2) NULL,
  mat DECIMAL(5,2) NULL,
  bio DECIMAL(5,2) NULL,
  che DECIMAL(5,2) NULL,
  phy DECIMAL(5,2) NULL,
  cre DECIMAL(5,2) NULL,
  his DECIMAL(5,2) NULL,
  geo DECIMAL(5,2) NULL,
  comp DECIMAL(5,2) NULL,
  bus DECIMAL(5,2) NULL,
  agr DECIMAL(5,2) NULL,
  total DECIMAL(7,2) NULL,
  avg DECIMAL(5,2) NULL,
  grade VARCHAR(2) NULL,
  term VARCHAR(40),
  academic_year INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_form1_transcript_student (student_id),
  CONSTRAINT fk_form1_transcript_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS form2_transcript (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  adm VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  stream VARCHAR(40),
  eng DECIMAL(5,2) NULL,
  kisw DECIMAL(5,2) NULL,
  mat DECIMAL(5,2) NULL,
  bio DECIMAL(5,2) NULL,
  che DECIMAL(5,2) NULL,
  phy DECIMAL(5,2) NULL,
  cre DECIMAL(5,2) NULL,
  his DECIMAL(5,2) NULL,
  geo DECIMAL(5,2) NULL,
  comp DECIMAL(5,2) NULL,
  bus DECIMAL(5,2) NULL,
  agr DECIMAL(5,2) NULL,
  total DECIMAL(7,2) NULL,
  avg DECIMAL(5,2) NULL,
  grade VARCHAR(2) NULL,
  term VARCHAR(40),
  academic_year INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_form2_transcript_student (student_id),
  CONSTRAINT fk_form2_transcript_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS form3_transcript (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  adm VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  stream VARCHAR(40),
  eng DECIMAL(5,2) NULL,
  kisw DECIMAL(5,2) NULL,
  mat DECIMAL(5,2) NULL,
  bio DECIMAL(5,2) NULL,
  che DECIMAL(5,2) NULL,
  phy DECIMAL(5,2) NULL,
  cre DECIMAL(5,2) NULL,
  his DECIMAL(5,2) NULL,
  geo DECIMAL(5,2) NULL,
  comp DECIMAL(5,2) NULL,
  bus DECIMAL(5,2) NULL,
  agr DECIMAL(5,2) NULL,
  total DECIMAL(7,2) NULL,
  avg DECIMAL(5,2) NULL,
  grade VARCHAR(2) NULL,
  term VARCHAR(40),
  academic_year INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_form3_transcript_student (student_id),
  CONSTRAINT fk_form3_transcript_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS form4_transcript (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  adm VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  stream VARCHAR(40),
  eng DECIMAL(5,2) NULL,
  kisw DECIMAL(5,2) NULL,
  mat DECIMAL(5,2) NULL,
  bio DECIMAL(5,2) NULL,
  che DECIMAL(5,2) NULL,
  phy DECIMAL(5,2) NULL,
  cre DECIMAL(5,2) NULL,
  his DECIMAL(5,2) NULL,
  geo DECIMAL(5,2) NULL,
  comp DECIMAL(5,2) NULL,
  bus DECIMAL(5,2) NULL,
  agr DECIMAL(5,2) NULL,
  total DECIMAL(7,2) NULL,
  avg DECIMAL(5,2) NULL,
  grade VARCHAR(2) NULL,
  term VARCHAR(40),
  academic_year INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_form4_transcript_student (student_id),
  CONSTRAINT fk_form4_transcript_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  type VARCHAR(60) DEFAULT 'notes',
  subject VARCHAR(100),
  class_id INT,
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  mime_type VARCHAR(120),
  file_size BIGINT DEFAULT 0,
  uploaded_by INT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_academic_documents_type (type),
  CONSTRAINT fk_academic_documents_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_academic_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(100),
  class_id INT,
  description TEXT,
  due_date DATE,
  filename VARCHAR(255),
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_assignments_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  filename VARCHAR(255),
  notes TEXT,
  grade DECIMAL(6,2),
  feedback TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================================
-- SYSTEM & LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(120) NOT NULL,
  details TEXT,
  ip_address VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_logs_action (action),
  INDEX idx_activity_logs_user (user_id),
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50),
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

SET FOREIGN_KEY_CHECKS=1;
