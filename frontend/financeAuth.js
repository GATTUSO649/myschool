// Finance Page Authentication Handler
// Simple, isolated auth check for finance page only

(function() {
  'use strict';

  // Check if user is authenticated
  function isAuthenticated() {
    const token = sessionStorage.getItem('authToken');
    return !!token && token.length > 0;
  }

  // Load student name
  function loadStudentName() {
    try {
      const studentJson = sessionStorage.getItem('student');
      if (!studentJson) return false;
      
      const student = JSON.parse(studentJson);
      const nameEl = document.getElementById('studentName');
      
      if (nameEl && student.name) {
        nameEl.textContent = student.name;
        return true;
      }
    } catch (e) {
      console.error('Error loading student name:', e);
    }
    return false;
  }

  // Initialize page
  function init() {
    if (!isAuthenticated()) {
      // Not authenticated - redirect to login
      window.location.href = 'login.html';
      return;
    }
    
    // Authenticated - load student name
    loadStudentName();
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
