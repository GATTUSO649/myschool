import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-dark-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <span className="text-2xl font-bold">
              <span className="text-primary-500">CRESENT</span> HIGH SCHOOL
            </span>
          </Link>

          <nav className="hidden md:flex space-x-8">
            <Link to="/dashboard" className="hover:text-primary-400 transition">Dashboard</Link>
            <Link to="/academic" className="hover:text-primary-400 transition">Academics</Link>
            <Link to="/finance" className="hover:text-primary-400 transition">Finance</Link>
            <Link to="/exams" className="hover:text-primary-400 transition">Exams</Link>
            <Link to="/calendar" className="hover:text-primary-400 transition">Events</Link>
          </nav>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center space-x-2 hover:text-primary-400 transition"
            >
              <span>{user?.name}</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white text-dark-700 rounded-lg shadow-lg z-50">
                <Link to="/settings" className="block px-4 py-2 hover:bg-gray-100 first:rounded-t-lg">Settings</Link>
                <Link to="/notifications" className="block px-4 py-2 hover:bg-gray-100">Notifications</Link>
                <Link to="/help" className="block px-4 py-2 hover:bg-gray-100">Help</Link>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 border-t last:rounded-b-lg text-red-600"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:block w-64 bg-gray-50 border-r">
      <nav className="p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase">Student</h3>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/academic">Academics</NavLink>
          <NavLink to="/finance">Finance</NavLink>
          <NavLink to="/exams">Exams</NavLink>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase">Support</h3>
          <NavLink to="/clearance">Clearance & Request</NavLink>
          <NavLink to="/lecturer-interaction">Lecturer Interaction</NavLink>
          <NavLink to="/help">Help</NavLink>
        </div>
      </nav>
    </aside>
  );
}

function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="block px-4 py-2 rounded-lg hover:bg-primary-100 hover:text-primary-700 transition text-gray-700"
    >
      {children}
    </Link>
  );
}
