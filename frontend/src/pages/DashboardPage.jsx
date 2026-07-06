import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentService } from '../services/api';
import { DashboardLayout } from '../components/Layouts';
import { formatCurrency, calculateProgress } from '../utils/helpers';

export function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await studentService.getDashboard();
      setDashboard(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load dashboard');
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

  const progress = dashboard?.academicYear
    ? calculateProgress(dashboard.academicYear.startDate, dashboard.academicYear.endDate)
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <section className="glass-card p-8 rounded-2xl">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Welcome, {user?.name}
          </h2>
          <p className="text-gray-600">
            This is your student dashboard. Access your academic, financial, and personal information.
          </p>
        </section>

        {/* Academic Progress */}
        {dashboard?.academicYear && (
          <section className="bg-white rounded-2xl shadow-sm p-8">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">Academic Year Progress</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700 font-medium">{dashboard.academicYear.year}</span>
                <span className="text-primary-600 font-semibold">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-600 h-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{dashboard.academicYear.currentTerm}</span>
                <span>{Math.max(0, Math.ceil((dashboard.academicYear.daysRemaining || 0)))} days remaining</span>
              </div>
            </div>
          </section>
        )}

        {/* Quick Access Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <a
              key={service.href}
              href={service.href}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6 group"
            >
              <div className="text-primary-600 text-3xl mb-3 group-hover:scale-110 transition-transform">
                {service.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{service.title}</h3>
              <p className="text-gray-600 text-sm mb-4">{service.description}</p>
              <span className="text-primary-600 font-medium text-sm group-hover:underline">
                {service.action} →
              </span>
            </a>
          ))}
        </section>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const services = [
  {
    title: 'Academics',
    description: 'Check your subjects, notes, and academic progress.',
    href: '/academic',
    action: 'View Academics',
    icon: '📚'
  },
  {
    title: 'Notes',
    description: 'Access lecture notes and class study materials.',
    href: '/notes',
    action: 'View Notes',
    icon: '📖'
  },
  {
    title: 'Revision',
    description: 'Use revision materials and past papers.',
    href: '/revision',
    action: 'Study Resources',
    icon: '✏️'
  },
  {
    title: 'Events',
    description: 'View school events and important dates.',
    href: '/calendar',
    action: 'View Events',
    icon: '📅'
  },
  {
    title: 'Finance',
    description: 'Review fees, balances, and payment history.',
    href: '/finance',
    action: 'Open Finance',
    icon: '💰'
  },
  {
    title: 'Exams',
    description: 'Access exam results and transcripts.',
    href: '/exams',
    action: 'View Exams',
    icon: '🎓'
  },
  {
    title: 'Clearance & Requests',
    description: 'Submit requests and follow clearance progress.',
    href: '/clearance',
    action: 'Manage Requests',
    icon: '📋'
  },
  {
    title: 'Lecturer Interaction',
    description: 'Communicate with lecturers and tutors.',
    href: '/lecturer-interaction',
    action: 'Open Messages',
    icon: '💬'
  }
];
