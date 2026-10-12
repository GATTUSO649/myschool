-- Additive dual-curriculum admission data. Existing applications and students stay NULL.
ALTER TABLE applications
  ADD COLUMN curriculum_type VARCHAR(20) NULL,
  ADD COLUMN previous_education_stage VARCHAR(40) NULL,
  ADD COLUMN previous_grade_or_form VARCHAR(30) NULL,
  ADD COLUMN completion_year SMALLINT NULL,
  ADD COLUMN intended_admission_level VARCHAR(30) NULL,
  ADD COLUMN previous_assessment TEXT NULL,
  ADD COLUMN preferred_pathway VARCHAR(40) NULL,
  ADD COLUMN preferred_subject_combination VARCHAR(180) NULL,
  ADD COLUMN admission_placement_status VARCHAR(20) NULL,
  ADD COLUMN confirmed_admission_level VARCHAR(30) NULL,
  ADD INDEX idx_applications_curriculum_status (curriculum_type, status);

ALTER TABLE students
  ADD COLUMN curriculum_type VARCHAR(20) NULL,
  ADD COLUMN preferred_pathway VARCHAR(40) NULL;

CREATE TABLE IF NOT EXISTS cbe_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  curriculum_type VARCHAR(20) NOT NULL DEFAULT 'CBE',
  education_level VARCHAR(40) NULL,
  academic_year SMALLINT NOT NULL,
  learning_area VARCHAR(150) NOT NULL,
  assessment_title VARCHAR(180) NOT NULL,
  performance_descriptor VARCHAR(180) NOT NULL,
  evidence TEXT NULL,
  feedback TEXT NULL,
  assessed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cbe_assessments_student_year (student_id, academic_year),
  CONSTRAINT fk_cbe_assessments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cbe_assessments_assessor FOREIGN KEY (assessed_by) REFERENCES students(id) ON DELETE SET NULL
);
