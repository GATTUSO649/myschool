const ROLE_PERMISSIONS = {
  system_admin: [
    'system.dashboard.view',
    'staff.view', 'staff.create', 'staff.update', 'staff.deactivate',
    'staff.assign_role', 'staff.assign_department', 'staff.view_audit',
    'applications.view', 'applications.review',
    'students.view', 'students.create', 'students.update',
    'academics.dashboard.view', 'departments.view', 'departments.create', 'departments.update',
    'subjects.assign', 'teachers.assign', 'classes.manage', 'results.manage', 'transcripts.view',
    'finance.dashboard.view', 'financial_reports.view',
    'deputy.dashboard.view', 'attendance.view', 'attendance.manage', 'discipline.manage', 'school_reports.view',
    'teacher.dashboard.view', 'teacher.assigned_classes.view', 'teacher.assigned_students.view',
    'teacher.assigned_subjects.view', 'marks.enter', 'marks.update', 'marks.submit', 'resources.manage',
    'hod.dashboard.view', 'hod.department_students.view', 'hod.department_teachers.view',
    'hod.department_subjects.view', 'hod.department_results.view', 'hod.department_reports.view'
  ],
  school_admin: [
    'system.dashboard.view',
    'staff.view', 'staff.create', 'staff.update', 'staff.deactivate',
    'staff.assign_role', 'staff.assign_department', 'staff.view_audit',
    'applications.view', 'applications.review',
    'students.view', 'students.create', 'students.update',
    'academics.dashboard.view', 'departments.view', 'departments.create', 'departments.update',
    'subjects.assign', 'teachers.assign', 'classes.manage', 'results.manage', 'transcripts.view',
    'finance.dashboard.view', 'financial_reports.view',
    'deputy.dashboard.view', 'attendance.view', 'attendance.manage', 'discipline.manage', 'school_reports.view'
  ],
  deputy_principal: [
    'deputy.dashboard.view', 'students.view', 'attendance.view', 'attendance.manage',
    'discipline.manage', 'school_reports.view'
  ],
  academics_admin: [
    'academics.dashboard.view', 'students.view', 'students.create', 'students.update',
    'applications.view', 'departments.view', 'departments.create', 'departments.update',
    'subjects.assign', 'teachers.assign', 'classes.manage', 'results.manage', 'transcripts.view'
  ],
  finance_admin: [
    'finance.dashboard.view', 'fees.manage', 'payments.record', 'payments.verify',
    'receipts.generate', 'statements.view', 'financial_reports.view'
  ],
  department_head: [
    'hod.dashboard.view', 'hod.department_students.view', 'hod.department_teachers.view',
    'hod.department_subjects.view', 'hod.department_results.view', 'hod.department_reports.view'
  ],
  teacher: [
    'teacher.dashboard.view', 'teacher.assigned_classes.view', 'teacher.assigned_students.view',
    'teacher.assigned_subjects.view', 'marks.enter', 'marks.update', 'marks.submit', 'resources.manage'
  ],
  registrar: ['applications.view', 'applications.review', 'students.view', 'students.create', 'students.update'],
  librarian: [],
  ict_admin: [],
  discipline_officer: ['students.view', 'attendance.view', 'attendance.manage', 'discipline.manage'],
  counsellor: []
};

const ROLE_NAMES = {
  system_admin: 'System Administrator',
  school_admin: 'School Administrator',
  deputy_principal: 'Deputy Principal',
  academics_admin: 'Academics Administrator',
  finance_admin: 'Finance Administrator',
  department_head: 'Head of Department',
  teacher: 'Teacher',
  registrar: 'Registrar',
  librarian: 'Librarian',
  ict_admin: 'ICT Administrator',
  discipline_officer: 'Discipline Officer',
  counsellor: 'Guidance and Counselling'
};

const LEGACY_ROLE_MAP = {
  admin: 'school_admin',
  rba: 'school_admin',
  school_admin: 'school_admin',
  super_admin: 'system_admin',
  finance: 'finance_admin',
  accountant: 'finance_admin',
  ict: 'ict_admin',
  academics: 'academics_admin',
  academic: 'academics_admin',
  deputy: 'deputy_principal',
  hod: 'department_head',
  department_head: 'department_head',
  teacher: 'teacher',
  lecturer: 'teacher',
  registrar: 'registrar',
  librarian: 'librarian',
  discipline: 'discipline_officer',
  discipline_officer: 'discipline_officer',
  counsellor: 'counsellor'
};

const ROLE_LEGACY_ALIASES = {
  system_admin: ['admin'],
  school_admin: ['admin'],
  deputy_principal: ['deputy'],
  academics_admin: ['academics'],
  finance_admin: ['finance'],
  department_head: ['hod'],
  teacher: ['teacher'],
  registrar: ['registrar'],
  librarian: ['librarian'],
  ict_admin: ['ict'],
  discipline_officer: ['discipline'],
  counsellor: ['counsellor']
};

module.exports = { LEGACY_ROLE_MAP, ROLE_LEGACY_ALIASES, ROLE_NAMES, ROLE_PERMISSIONS };
