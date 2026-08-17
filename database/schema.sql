CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  username VARCHAR(80) UNIQUE,
  email VARCHAR(150) UNIQUE,
  admission_number VARCHAR(50) UNIQUE,
  password_hash VARCHAR(255),
  role ENUM('student','lecturer','rba') NOT NULL DEFAULT 'student',
  class_name VARCHAR(40),
  subject VARCHAR(100) NULL,
  stream VARCHAR(40),
  phone VARCHAR(40),
  guardian_name VARCHAR(150),
  guardian_phone VARCHAR(40),
  avatar VARCHAR(255),
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(40),
  date_of_birth DATE NULL,
  gender VARCHAR(30),
  class_name VARCHAR(40),
  previous_school VARCHAR(150),
  parent_name VARCHAR(150),
  parent_phone VARCHAR(40),
  address TEXT,
  requirements TEXT,
  medical_notes TEXT,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admission_number VARCHAR(50),
  stream VARCHAR(40),
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applications_status (status),
  CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS academic_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  type VARCHAR(60) NOT NULL DEFAULT 'notes',
  subject VARCHAR(100),
  class_name VARCHAR(40),
  topic VARCHAR(150),
  category VARCHAR(80),
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  mime_type VARCHAR(120),
  file_size BIGINT DEFAULT 0,
  due_date DATE NULL,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_academic_documents_type (type),
  CONSTRAINT fk_academic_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(100),
  class_name VARCHAR(40),
  description TEXT,
  due_date DATE NULL,
  filename VARCHAR(255),
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignments_uploader FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  filename VARCHAR(255),
  notes TEXT,
  grade DECIMAL(6,2) NULL,
  feedback TEXT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME NULL,
  start_date DATETIME NULL,
  end_date DATETIME NULL,
  type VARCHAR(60) DEFAULT 'event',
  subject VARCHAR(100),
  location VARCHAR(150),
  class_name VARCHAR(40),
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_calendar_created_by FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  type ENUM('feestatement','feestructure','receipt','other') DEFAULT 'other',
  target_class VARCHAR(40) NULL,
  target_term VARCHAR(40) NULL,
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  mime_type VARCHAR(120),
  file_size BIGINT DEFAULT 0,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_document_students (
  document_id INT NOT NULL,
  student_id INT NOT NULL,
  PRIMARY KEY (document_id, student_id),
  CONSTRAINT fk_finance_doc_students_doc FOREIGN KEY (document_id) REFERENCES finance_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_doc_students_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fee_charges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  description VARCHAR(180) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(80),
  academic_year INT,
  term VARCHAR(40),
  due_date DATE NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_charges_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_charges_creator FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  receipt_number VARCHAR(80) UNIQUE,
  description VARCHAR(180) DEFAULT 'School fees payment',
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(80),
  reference VARCHAR(120),
  academic_year INT,
  term VARCHAR(40),
  recorded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_payments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_payments_recorder FOREIGN KEY (recorded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(120) NOT NULL,
  details TEXT,
  ip_address VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_logs_action (action),
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  role_target VARCHAR(40),
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(30) DEFAULT 'normal',
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(100),
  class_name VARCHAR(40),
  topic VARCHAR(150),
  description TEXT,
  filename VARCHAR(255),
  file_size BIGINT DEFAULT 0,
  downloads INT DEFAULT 0,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_uploader FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS revision_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(100),
  class_name VARCHAR(40),
  topic VARCHAR(150),
  category VARCHAR(80),
  exam_year INT NULL,
  difficulty VARCHAR(40) DEFAULT 'intermediate',
  description TEXT,
  filename VARCHAR(255),
  downloads INT DEFAULT 0,
  estimated_time INT NULL,
  rating DECIMAL(3,2) DEFAULT 0,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_revision_uploader FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS study_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  material_id INT NOT NULL,
  studied TINYINT(1) DEFAULT 0,
  studied_at DATETIME NULL,
  UNIQUE KEY uniq_study_progress (student_id, material_id),
  CONSTRAINT fk_study_progress_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_study_progress_material FOREIGN KEY (material_id) REFERENCES revision_materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(100),
  class_name VARCHAR(40),
  exam_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  venue VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NULL,
  subject VARCHAR(100) NOT NULL,
  score DECIMAL(5,2),
  grade VARCHAR(10),
  term VARCHAR(40),
  academic_year INT,
  exam_type VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_results_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form INT NOT NULL COMMENT 'Form/Grade level: 1, 2, 3, or 4',
  name VARCHAR(80) UNIQUE COMMENT 'e.g., Form 1A, Form 2B',
  total_capacity INT DEFAULT 50,
  class_teacher_id INT NULL,
  academic_year INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_classes_form (form),
  INDEX idx_classes_year (academic_year),
  CONSTRAINT fk_classes_teacher FOREIGN KEY (class_teacher_id) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS class_streams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  stream_name VARCHAR(40) COMMENT 'e.g., Science, Arts, Commercial',
  enrollment_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_stream (class_id, stream_name),
  CONSTRAINT fk_class_stream_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_enrollment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_name VARCHAR(40),
  enrollment_date DATE NOT NULL,
  status ENUM('active','transferred','graduated','dropped') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_class (student_id, class_id),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  form INT COMMENT 'Form level: 1, 2, 3, or 4',
  stream_requirement VARCHAR(40) COMMENT 'Required stream if applicable',
  teaching_hours INT DEFAULT 0,
  credit_value INT DEFAULT 0,
  semester INT DEFAULT 1,
  academic_year INT,
  instructor_id INT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_courses_form (form),
  INDEX idx_courses_year (academic_year),
  CONSTRAINT fk_courses_instructor FOREIGN KEY (instructor_id) REFERENCES students(id) ON DELETE SET NULL
);
