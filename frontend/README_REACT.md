# CRESENT High School Portal - React Migration

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout.jsx          # Header, Sidebar, Navigation
│   │   └── Layouts.jsx         # DashboardLayout, AuthLayout
│   ├── context/
│   │   └── AuthContext.jsx     # Authentication state management
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── SignupPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── AcademicPage.jsx
│   │   ├── FinancePage.jsx
│   │   └── ExamsPage.jsx
│   ├── services/
│   │   └── api.js              # API client and endpoints
│   ├── utils/
│   │   ├── helpers.js          # Utility functions
│   │   └── ProtectedRoute.jsx  # Route protection
│   ├── App.jsx                 # Main app with routing
│   ├── main.jsx                # React entry point
│   └── index.css               # Tailwind + global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Installation & Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Set environment variables** (create `.env` file):
   ```
   VITE_API_URL=https://cresenthighschool.onrender.com/api
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Features Migrated to React

✅ **Authentication**
- Login page with email/name and password
- Signup page with new user registration
- Protected routes with token-based auth

✅ **Student Dashboard**
- Welcome section with student name
- Academic year progress bar
- Quick access cards to main features
- Real-time data loading

✅ **Academics**
- Subject list and course information
- Links to notes, revision materials
- Transcript access
- Exam results

✅ **Finance**
- Total billed, paid, and balance summary
- Fee statements
- Payment records
- Receipt viewing

✅ **Exams**
- Exam results table with grades
- Grade color coding
- Transcript and schedule links

## Architecture

- **State Management:** React Context API (AuthContext)
- **Styling:** TailwindCSS
- **HTTP Client:** Axios with interceptors
- **Routing:** React Router v6
- **Build Tool:** Vite

## Next Steps

To add more pages, create new files in `src/pages/` following the existing pattern:

```jsx
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/Layouts';

export function NewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load data
  }, []);

  return (
    <DashboardLayout>
      {/* Your content here */}
    </DashboardLayout>
  );
}
```

Then add the route in `App.jsx`.

## Removed Content

- All AI-related information has been removed
- Focus is on core student portal functionality
- Clean, professional business interface
