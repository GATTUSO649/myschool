const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCbeOfferings,
  validateApplicationCurriculum,
  validateConfirmedPlacement
} = require('../services/applicationCurriculum');

const completionYear = String(new Date().getFullYear() - 1);

test('validates and normalizes a CBE senior-school application', () => {
  const result = validateApplicationCurriculum({
    curriculumType: 'CBE',
    previousSchool: 'Previous School',
    previousEducationStage: 'Junior School',
    previousGradeOrForm: 'Grade 9',
    completionYear,
    intendedAdmissionLevel: 'Grade 10',
    preferredPathway: 'STEM'
  });

  assert.equal(result.valid, true);
  assert.equal(result.fields.curriculumType, 'CBE');
  assert.equal(result.fields.completionYear, Number(completionYear));
});

test('validates an 8-4-4 application without converting forms to CBE grades', () => {
  const result = validateApplicationCurriculum({
    curriculumType: '8-4-4',
    previousSchool: 'Previous School',
    previousEducationStage: 'Primary School',
    previousGradeOrForm: 'Standard 8',
    completionYear,
    intendedAdmissionLevel: 'Form 1'
  });

  assert.equal(result.valid, true);
  assert.equal(validateApplicationCurriculum({
    curriculumType: '8-4-4',
    previousSchool: 'Previous School',
    previousEducationStage: 'Secondary School',
    previousGradeOrForm: 'Grade 9',
    completionYear,
    intendedAdmissionLevel: 'Grade 10'
  }).valid, false);
});

test('rejects missing/invalid curriculum, stage, completion year, pathway and unconfigured combinations', () => {
  const base = {
    curriculumType: 'CBE',
    previousSchool: 'Previous School',
    previousEducationStage: 'Junior School',
    previousGradeOrForm: 'Grade 9',
    completionYear,
    intendedAdmissionLevel: 'Grade 10'
  };

  assert.equal(validateApplicationCurriculum({ ...base, curriculumType: 'other' }).valid, false);
  assert.equal(validateApplicationCurriculum({ ...base, previousEducationStage: 'Primary School' }).valid, false);
  assert.equal(validateApplicationCurriculum({ ...base, completionYear: '' }).valid, false);
  assert.equal(validateApplicationCurriculum({ ...base, preferredPathway: 'Unverified pathway' }).valid, false);
  assert.equal(validateApplicationCurriculum({ ...base, preferredSubjectCombination: 'Imaginary combination' }).valid, false);
  assert.deepEqual(parseCbeOfferings('STEM: Physics and Mathematics\nNot a pathway: Unknown'), [
    { pathway: 'STEM', combination: 'Physics and Mathematics' }
  ]);
});

test('accepts only curriculum-compatible admission placement values', () => {
  assert.equal(validateConfirmedPlacement('CBE', 'Grade 11'), true);
  assert.equal(validateConfirmedPlacement('CBE', 'Form 2'), false);
  assert.equal(validateConfirmedPlacement('8-4-4', 'Form 2'), true);
  assert.equal(validateConfirmedPlacement('8-4-4', 'Grade 11'), false);
});
