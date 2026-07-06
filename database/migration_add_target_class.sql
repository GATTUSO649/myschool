-- Migration: Add target_class column to finance_documents
-- This allows fee structures to be assigned to specific forms/classes
-- and automatically appear for all students in that form

ALTER TABLE finance_documents 
ADD COLUMN target_class VARCHAR(40) NULL 
AFTER type;

-- Optional: Add index for faster queries
CREATE INDEX idx_finance_documents_target_class ON finance_documents(target_class);
