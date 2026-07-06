import { useState, useEffect } from 'react';
import { studentService } from '../services/api';
import { DashboardLayout } from '../components/Layouts';

export function ExamsPage() {
  const [exams, setExams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    try {
      const response = await studentService.getExams();
      setExams(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load exam results');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section className="glass-card p-8 rounded-2xl">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Exam Results</h2>
          <p className="text-gray-600">
            Access your exam results, grades, transcripts, and performance records.
          </p>
        </section>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Results Grid */}
        {exams?.results && exams.results.length > 0 ? (
          <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Exam</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Mark</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {exams.results.map((result) => (
                  <tr key={result.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm text-gray-800">{result.subject}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{result.examName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{result.mark}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getGradeColor(result.grade)}`}>
                        {result.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <p className="text-gray-600">No exam results available yet.</p>
          </div>
        )}

        {/* Quick Links */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a
            href="/transcript"
            className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6"
          >
            <div className="text-3xl mb-3">📄</div>
            <h3 className="font-semibold text-gray-800 mb-2">My Transcript</h3>
            <p className="text-sm text-gray-600">View your complete academic transcript.</p>
          </a>
          <a
            href="/calendar"
            className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6"
          >
            <div className="text-3xl mb-3">📅</div>
            <h3 className="font-semibold text-gray-800 mb-2">Exam Schedule</h3>
            <p className="text-sm text-gray-600">View upcoming exam dates and schedules.</p>
          </a>
        </section>
      </div>
    </DashboardLayout>
  );
}

function getGradeColor(grade) {
  const gradeMap = {
    'A': 'bg-green-100 text-green-800',
    'B': 'bg-blue-100 text-blue-800',
    'C': 'bg-yellow-100 text-yellow-800',
    'D': 'bg-orange-100 text-orange-800',
    'E': 'bg-red-100 text-red-800',
  };
  return gradeMap[grade] || 'bg-gray-100 text-gray-800';
}
