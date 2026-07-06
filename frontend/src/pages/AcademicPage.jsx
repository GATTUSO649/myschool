import { useState, useEffect } from 'react';
import { studentService } from '../services/api';
import { DashboardLayout } from '../components/Layouts';

export function AcademicPage() {
  const [academics, setAcademics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAcademics();
  }, []);

  const loadAcademics = async () => {
    try {
      const response = await studentService.getAcademics();
      setAcademics(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load academic information');
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
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Student Academics</h2>
          <p className="text-gray-600">Access your academic records and course information.</p>
        </section>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Subjects Section */}
        {academics?.subjects && (
          <section className="bg-white rounded-2xl shadow-sm p-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6">Your Subjects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {academics.subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-400 hover:bg-primary-50 transition"
                >
                  <h4 className="font-semibold text-gray-800">{subject.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">Code: {subject.code}</p>
                  <p className="text-sm text-gray-600">Units: {subject.units}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Academic Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {academicCards.map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6"
            >
              <div className="text-2xl mb-3">{card.icon}</div>
              <h3 className="font-semibold text-gray-800 mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{card.description}</p>
              <span className="text-primary-600 font-medium text-sm">Learn More →</span>
            </a>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}

const academicCards = [
  {
    title: 'Lecturer Notes',
    description: 'Access lecture notes and class learning materials.',
    href: '/notes',
    icon: '📖'
  },
  {
    title: 'Revision Papers',
    description: 'View revision and past exam papers.',
    href: '/revision',
    icon: '✏️'
  },
  {
    title: 'My Transcript',
    description: 'View your academic transcript.',
    href: '/transcript',
    icon: '📄'
  },
  {
    title: 'Results',
    description: 'Check your exam results and grades.',
    href: '/exams',
    icon: '📊'
  },
  {
    title: 'Course Registration',
    description: 'Confirm your registered subjects.',
    href: '#subjects',
    icon: '✅'
  },
  {
    title: 'Academic Calendar',
    description: 'View important academic dates.',
    href: '/calendar',
    icon: '📅'
  }
];
