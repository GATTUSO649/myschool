import { useState, useEffect } from 'react';
import { studentService } from '../services/api';
import { DashboardLayout } from '../components/Layouts';
import { formatCurrency } from '../utils/helpers';

export function FinancePage() {
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFinance();
  }, []);

  const loadFinance = async () => {
    try {
      const response = await studentService.getFinance();
      setFinance(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load finance information');
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

  const balance = (finance?.totalCharges || 0) - (finance?.totalPaid || 0);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section className="glass-card p-8 rounded-2xl">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Finance</h2>
          <p className="text-gray-600">
            View your school fees, balances, statements, and payment history.
          </p>
        </section>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Finance Summary Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-primary-600">
            <p className="text-gray-600 text-sm mb-2">Total Billed</p>
            <p className="text-3xl font-bold text-gray-800">
              {formatCurrency(finance?.totalCharges || 0)}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-green-600">
            <p className="text-gray-600 text-sm mb-2">Total Paid</p>
            <p className="text-3xl font-bold text-gray-800">
              {formatCurrency(finance?.totalPaid || 0)}
            </p>
          </div>
          <div className={`bg-white rounded-2xl shadow-sm p-6 border-l-4 ${balance > 0 ? 'border-red-600' : 'border-green-600'}`}>
            <p className="text-gray-600 text-sm mb-2">Balance</p>
            <p className={`text-3xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
        </section>

        {/* Finance Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {financeCards.map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-6"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="font-semibold text-gray-800 mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{card.description}</p>
              <span className="text-primary-600 font-medium text-sm">View Details →</span>
            </a>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}

const financeCards = [
  {
    title: 'Fee Statement',
    description: 'Review your personalized fee statement.',
    href: '/feestatement',
    icon: '📋'
  },
  {
    title: 'Fee Structure',
    description: 'Check the school fee structure.',
    href: '/feestructure',
    icon: '📊'
  },
  {
    title: 'Payments & Receipts',
    description: 'View payment history and receipts.',
    href: '/payments',
    icon: '🧾'
  },
  {
    title: 'Payment Records',
    description: 'Track all payments made.',
    href: '/payment-records',
    icon: '💳'
  }
];
