function parseConfiguredOptions(value) {
  return [...new Set(String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function validateCbeAssessment(input, settings) {
  const learningAreas = parseConfiguredOptions(settings.cbeLearningAreas);
  const descriptors = parseConfiguredOptions(settings.cbePerformanceDescriptors);
  const studentId = Number(input.studentId);
  const year = Number(input.academicYear);
  const learningArea = String(input.learningArea || '').trim();
  const assessmentTitle = String(input.assessmentTitle || '').trim();
  const performanceDescriptor = String(input.performanceDescriptor || '').trim();
  const evidence = String(input.evidence || '').trim();
  const feedback = String(input.feedback || '').trim();

  if (!Number.isSafeInteger(studentId) || studentId < 1) {
    return { error: 'Select a valid CBE student.' };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: 'Enter a valid academic year.' };
  }
  if (!learningAreas.includes(learningArea)) {
    return { error: 'Select a learning area configured by the school.' };
  }
  if (!assessmentTitle || assessmentTitle.length > 180) {
    return { error: 'Assessment title is required and must be 180 characters or fewer.' };
  }
  if (!descriptors.includes(performanceDescriptor)) {
    return { error: 'Select a performance descriptor configured by the school.' };
  }
  if (evidence.length > 5000 || feedback.length > 5000) {
    return { error: 'Evidence and feedback must each be 5,000 characters or fewer.' };
  }

  return {
    value: {
      studentId,
      academicYear: year,
      learningArea,
      assessmentTitle,
      performanceDescriptor,
      evidence: evidence || null,
      feedback: feedback || null
    }
  };
}

module.exports = { parseConfiguredOptions, validateCbeAssessment };
