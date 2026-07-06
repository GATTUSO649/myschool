-- Migration: Add target_term column to finance_documents
-- This allows fee structure documents to be assigned to a specific term

ALTER TABLE finance_documents 
ADD COLUMN target_term VARCHAR(40) NULL AFTER target_class;

CREATE INDEX idx_finance_documents_target_term ON finance_documents(target_term);
