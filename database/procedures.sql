USE cresent_high_school_portal;

DROP VIEW IF EXISTS student_fee_balances;

CREATE VIEW student_fee_balances AS
SELECT
  s.id AS student_id,
  s.name AS student_name,
  s.admission_number,
  s.class_name,
  COALESCE(charges.total_charged, 0) AS total_charged,
  COALESCE(payments.total_paid, 0) AS total_paid,
  COALESCE(charges.total_charged, 0) - COALESCE(payments.total_paid, 0) AS balance
FROM students s
LEFT JOIN (
  SELECT student_id, SUM(amount) AS total_charged
  FROM fee_charges
  GROUP BY student_id
) charges ON charges.student_id = s.id
LEFT JOIN (
  SELECT student_id, SUM(amount) AS total_paid
  FROM fee_payments
  GROUP BY student_id
) payments ON payments.student_id = s.id;

DROP PROCEDURE IF EXISTS get_student_statement;

DELIMITER //
CREATE PROCEDURE get_student_statement(IN p_student_id INT)
BEGIN
  SELECT * FROM student_fee_balances WHERE student_id = p_student_id;

  SELECT 'charge' AS entry_type, description, amount, term, academic_year, created_at
  FROM fee_charges
  WHERE student_id = p_student_id
  UNION ALL
  SELECT 'payment' AS entry_type, description, amount * -1 AS amount, term, academic_year, created_at
  FROM fee_payments
  WHERE student_id = p_student_id
  ORDER BY created_at;
END //
DELIMITER ;
