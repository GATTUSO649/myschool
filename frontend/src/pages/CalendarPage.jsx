import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/Layouts';
import { Link } from 'react-router-dom';

export function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch events from API
    setLoading(false);
  }, []);

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
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Events & Calendar</h2>
          <p className="text-gray-600">View school events, academic dates, and important deadlines.</p>
        </section>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {events.length > 0 ? (
            <div className="space-y-4">
              {events.map((event) => (
                <div key={event.id} className="border-l-4 border-primary-600 pl-4 py-2">
                  <h3 className="font-semibold text-gray-800">{event.title}</h3>
                  <p className="text-sm text-gray-600">{event.date}</p>
                  <p className="text-sm text-gray-700 mt-1">{event.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No events scheduled.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
