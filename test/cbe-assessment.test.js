const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfiguredOptions, validateCbeAssessment } = require('../services/cbeAssessment');

const settings = {
  cbeLearningAreas: 'Mathematics\nIntegrated Science\nMathematics',
  cbePerformanceDescriptors: 'Emerging\nDeveloping\nMeeting Expectations\nExceeding Expectations'
};

test('configured CBE options are trimmed and deduplicated', () => {
  assert.deepEqual(parseConfiguredOptions(' STEM \n\nSTEM\nArts '), ['STEM', 'Arts']);
});

test('valid CBE descriptive assessment preserves configured descriptor without numeric grades', () => {
  const result = validateCbeAssessment({
    studentId: '12',
    academicYear: '2026',
    learningArea: 'Mathematics',
    assessmentTitle: 'Term 1 investigation',
    performanceDescriptor: 'Meeting Expectations',
    evidence: 'Explained the reasoning used.',
    feedback: 'Show each step clearly.'
  }, settings);

  assert.deepEqual(result.value, {
    studentId: 12,
    academicYear: 2026,
    learningArea: 'Mathematics',
    assessmentTitle: 'Term 1 investigation',
    performanceDescriptor: 'Meeting Expectations',
    evidence: 'Explained the reasoning used.',
    feedback: 'Show each step clearly.'
  });
});

test('CBE assessment rejects unconfigured options and invalid values', () => {
  const result = validateCbeAssessment({
    studentId: '0',
    academicYear: '2026',
    learningArea: 'Unconfigured area',
    assessmentTitle: '',
    performanceDescriptor: 'A',
    evidence: 'Evidence',
    feedback: ''
  }, settings);

  assert.equal(result.error, 'Select a valid CBE student.');
});

test('CBE assessment rejects learning areas and descriptors not approved in settings', () => {
  const result = validateCbeAssessment({
    studentId: '12',
    academicYear: '2026',
    learningArea: 'Unconfigured area',
    assessmentTitle: 'Term 1 investigation',
    performanceDescriptor: 'A',
    evidence: '',
    feedback: ''
  }, settings);

  assert.equal(result.error, 'Select a learning area configured by the school.');
});

test('CBE assessment rejects unconfigured descriptors', () => {
  const result = validateCbeAssessment({
    studentId: '12',
    academicYear: '2026',
    learningArea: 'Mathematics',
    assessmentTitle: 'Term 1 investigation',
    performanceDescriptor: 'A',
    evidence: '',
    feedback: ''
  }, settings);

  assert.equal(result.error, 'Select a performance descriptor configured by the school.');
});
