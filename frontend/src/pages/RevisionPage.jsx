import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/Layouts';

export function RevisionPage() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch revision materials from API
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
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Revision Materials</h2>
          <p className="text-gray-600">Access revision materials, past papers, and exam preparation resources.</p>
        </section>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {materials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {materials.map((material) => (
                <a
                  key={material.id}
                  href={material.fileUrl}
                  download
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-400 hover:bg-primary-50 transition"
                >
                  <div className="text-2xl mb-2">📚</div>
                  <h4 className="font-semibold text-gray-800">{material.title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{material.type}</p>
                  <p className="text-xs text-gray-500 mt-2">Click to download</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No revision materials available yet.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
