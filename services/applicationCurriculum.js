const CURRICULA = ['CBE', '8-4-4'];
const CBE_PATHWAYS = ['STEM', 'Social Sciences', 'Arts and Sports Science'];

const CBE_STAGE_GRADES = {
  'Early Years Education': ['PP1', 'PP2'],
  'Primary School': ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'],
  'Junior School': ['Grade 7', 'Grade 8', 'Grade 9'],
  'Senior School': ['Grade 10', 'Grade 11', 'Grade 12']
};
const EIGHT_FOUR_FOUR_STAGE_GRADES = {
  'Primary School': ['Standard 1', 'Standard 2', 'Standard 3', 'Standard 4', 'Standard 5', 'Standard 6', 'Standard 7', 'Standard 8'],
  'Secondary School': ['Form 1', 'Form 2', 'Form 3', 'Form 4']
};
const CBE_ADMISSION_LEVELS = ['Grade 10', 'Grade 11', 'Grade 12'];
const EIGHT_FOUR_FOUR_ADMISSION_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];

function normalizeApplicationCurriculum(body = {}) {
  return {
    curriculumType: String(body.curriculumType || body.curriculum_type || '').trim(),
    previousSchool: String(body.previousSchool || body.previous_school || '').trim(),
    previousEducationStage: String(body.previousEducationStage || body.previous_education_stage || '').trim(),
    previousGradeOrForm: String(body.previousGradeOrForm || body.previous_grade_or_form || '').trim(),
    completionYear: String(body.completionYear || body.completion_year || '').trim(),
    intendedAdmissionLevel: String(body.intendedAdmissionLevel || body.intended_admission_level || body.className || body.class_name || '').trim(),
    previousAssessment: String(body.previousAssessment || body.previous_assessment || body.kcpeMarks || body.kcpe_marks || '').trim(),
    preferredPathway: String(body.preferredPathway || body.preferred_pathway || '').trim(),
    preferredSubjectCombination: String(body.preferredSubjectCombination || body.preferred_subject_combination || '').trim()
  };
}

function parseCbeOfferings(settingValue) {
  return String(settingValue || '')
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator < 0) return null;
      const pathway = line.slice(0, separator).trim();
      const combination = line.slice(separator + 1).trim();
      return CBE_PATHWAYS.includes(pathway) && combination && combination.length <= 180 ? { pathway, combination } : null;
    })
    .filter(Boolean);
}

function validateApplicationCurriculum(body, offerings = []) {
  const fields = normalizeApplicationCurriculum(body);
  if (!CURRICULA.includes(fields.curriculumType)) {
    return { valid: false, message: 'Select a valid education curriculum.' };
  }
  if (!fields.previousSchool) {
    return { valid: false, message: 'Previous school is required.' };
  }
  const completionYear = Number(fields.completionYear);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(completionYear) || completionYear < 1900 || completionYear > currentYear + 1) {
    return { valid: false, message: 'Enter a valid completion year.' };
  }

  const stageGrades = fields.curriculumType === 'CBE' ? CBE_STAGE_GRADES : EIGHT_FOUR_FOUR_STAGE_GRADES;
  const allowedGrades = stageGrades[fields.previousEducationStage];
  if (!allowedGrades || !allowedGrades.includes(fields.previousGradeOrForm)) {
    return { valid: false, message: 'The previous education stage and grade/form do not match the selected curriculum.' };
  }

  const admissionLevels = fields.curriculumType === 'CBE' ? CBE_ADMISSION_LEVELS : EIGHT_FOUR_FOUR_ADMISSION_LEVELS;
  if (!admissionLevels.includes(fields.intendedAdmissionLevel)) {
    return {
      valid: false,
      message: fields.curriculumType === 'CBE'
        ? 'Cresent High School applications must select a senior-school admission level (Grade 10–12).'
        : 'Select a valid 8-4-4 admission form (Form 1–4).'
    };
  }

  if (fields.curriculumType === '8-4-4' && (fields.preferredPathway || fields.preferredSubjectCombination)) {
    return { valid: false, message: 'Pathway preferences are only available for CBE applications.' };
  }
  if (fields.curriculumType === 'CBE') {
    if (fields.preferredPathway && !CBE_PATHWAYS.includes(fields.preferredPathway)) {
      return { valid: false, message: 'Select a valid CBE pathway preference.' };
    }
    if (fields.preferredSubjectCombination) {
      const match = offerings.find((offering) => offering.combination === fields.preferredSubjectCombination);
      if (!match || (fields.preferredPathway && match.pathway !== fields.preferredPathway)) {
        return { valid: false, message: 'Select a subject combination currently configured by the school for that pathway.' };
      }
      if (!fields.preferredPathway) fields.preferredPathway = match.pathway;
    }
  }

  return { valid: true, fields: { ...fields, completionYear } };
}

function validateConfirmedPlacement(curriculumType, placement) {
  const validPlacements = curriculumType === 'CBE'
    ? CBE_ADMISSION_LEVELS
    : curriculumType === '8-4-4'
      ? EIGHT_FOUR_FOUR_ADMISSION_LEVELS
      : [];
  return validPlacements.includes(String(placement || '').trim());
}

module.exports = {
  CURRICULA,
  CBE_PATHWAYS,
  CBE_STAGE_GRADES,
  EIGHT_FOUR_FOUR_STAGE_GRADES,
  CBE_ADMISSION_LEVELS,
  EIGHT_FOUR_FOUR_ADMISSION_LEVELS,
  normalizeApplicationCurriculum,
  parseCbeOfferings,
  validateApplicationCurriculum,
  validateConfirmedPlacement
};
