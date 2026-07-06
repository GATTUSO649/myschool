# Cresent High School - Frontend Structure

## Recommended File Organization

```
frontend/
├── pages/                    # Main page files
│   ├── admin/
│   │   ├── dashboard.html
│   │   ├── students.html
│   │   ├── fees.html
│   │   ├── academics.html
│   │   ├── reports.html
│   │   └── settings.html
│   ├── student/
│   │   ├── dashboard.html
│   │   ├── academics.html
│   │   ├── fees.html
│   │   ├── transcript.html
│   │   └── profile.html
│   ├── teacher/
│   │   ├── dashboard.html
│   │   ├── classes.html
│   │   ├── marks.html
│   │   └── attendance.html
│   └── auth/
│       ├── login.html
│       ├── signup.html
│       └── forgot-password.html
│
├── assets/                  # Images, icons, fonts
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── styles/                  # CSS files
│   ├── common/
│   │   ├── base.css
│   │   ├── layout.css
│   │   └── responsive.css
│   ├── admin/
│   │   ├── dashboard.css
│   │   └── components.css
│   ├── student/
│   │   └── dashboard.css
│   ├── teacher/
│   │   └── dashboard.css
│   └── auth/
│       └── auth-forms.css
│
├── scripts/                 # JavaScript files
│   ├── common/
│   │   ├── auth.js
│   │   ├── api.js
│   │   └── utils.js
│   ├── admin/
│   │   ├── dashboard.js
│   │   ├── students.js
│   │   ├── fees.js
│   │   └── reports.js
│   ├── student/
│   │   └── dashboard.js
│   └── teacher/
│       └── dashboard.js
│
├── components/             # Reusable components
│   ├── navbar.html
│   ├── sidebar.html
│   ├── modals.html
│   ├── forms.html
│   └── tables.html
│
├── index.html              # Main entry point
└── config.js               # App configuration
```

## Backend API Structure

```
backend/
├── config/
│   ├── db.js              # Database connection
│   └── env-example        # Environment template
│
├── controllers/           # Business logic
│   ├── adminDashboardController.js
│   ├── studentController.js
│   ├── teacherController.js
│   ├── academicController.js
│   ├── financeController.js
│   └── authController.js
│
├── routes/               # API endpoints
│   ├── admin.js
│   ├── students.js
│   ├── academics.js
│   ├── finance.js
│   └── auth.js
│
├── middleware/          # Custom middleware
│   ├── auth.js
│   ├── errorHandler.js
│   └── validation.js
│
└── database/           # Database files
    ├── schema.sql       # Database schema
    ├── schema_new.sql   # Updated schema
    └── sample_data.sql  # Sample data
```

## Installation & Setup

### Prerequisites
- Node.js (v14+)
- MySQL Server
- npm/yarn

### Step 1: Environment Setup

Create `.env` file in root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cresent_school

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d

# App
APP_NAME=CRESENT High School
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000/frontend
```

### Step 2: Database Setup

1. Import new schema:
```bash
mysql -u root -p cresent_school < database/schema_new.sql
```

2. Run initial setup:
```bash
npm run db:init
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Documentation

### Admin Endpoints

#### Dashboard
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/logs` - Get activity logs

#### Students
- `GET /api/students` - List all students
- `POST /api/students/register` - Register new student
- `GET /api/students/:id` - Get student profile
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Deactivate student

#### Finance
- `GET /api/finance/fee-structure` - Get fee structures
- `POST /api/finance/fee-structure` - Create fee structure
- `GET /api/finance/payments` - Get payments
- `POST /api/finance/payments` - Record payment
- `GET /api/finance/statements` - Get fee statements

#### Academics
- `GET /api/academics/classes` - Get classes
- `POST /api/academics/classes` - Create class
- `GET /api/academics/courses` - Get courses
- `POST /api/academics/courses` - Create course
- `GET /api/academics/marks` - Get marks
- `POST /api/academics/marks` - Record marks

## MySQL Workbench Connection

### Setup Steps

1. Open MySQL Workbench
2. Click "+" next to "MySQL Connections"
3. Configure:
   - **Connection Name:** Cresent School
   - **Hostname:** localhost
   - **Port:** 3306 (default)
   - **Username:** root
   - **Password:** [your password]

4. Click "Test Connection"
5. Click "OK" to save

### Viewing Tables

1. Double-click the connection to open
2. In the left panel, you'll see the database `cresent_school`
3. Expand to see all tables:
   - users
   - students
   - classes
   - courses
   - academic_years
   - attendance
   - marks
   - results
   - fee_structure
   - fee_charges
   - fee_payments
   - transcripts
   - etc.

4. Right-click on any table and select "Select Rows" to view data

## Features Implemented

### Admin Dashboard
- ✓ Dashboard overview with statistics
- ✓ Student management (register, view, edit)
- ✓ Fee management (record payments, view statements, configure structure)
- ✓ Academic management (classes, courses, attendance, marks)
- ✓ Exams management
- ✓ Reports generation
- ✓ Activity logs
- ✓ Database management
- ✓ User management

### Key Tables
- **users** - All users (students, teachers, admins)
- **students** - Student information
- **classes** - Class definitions
- **courses** - Course/subject definitions
- **academic_years** - Academic year records
- **attendance** - Attendance records
- **marks** - Student marks/grades
- **results** - Student results slips
- **fee_structure** - Fee configuration
- **fee_charges** - Student fee charges
- **fee_payments** - Payment records
- **transcripts** - Student transcripts
- **activity_logs** - System activity logs

## Frontend Development

### Using Charts.js
Charts are automatically initialized in the admin dashboard for:
- Fee Collection (Bar Chart)
- Student Distribution by Form (Doughnut Chart)

### Responsive Design
All pages are responsive and work on:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (< 768px)

## Troubleshooting

### MySQL Connection Issues
1. Ensure MySQL Server is running
2. Check credentials in `.env`
3. Verify database exists: `SHOW DATABASES;`
4. Check table count: `SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'cresent_school';`

### JavaScript Errors
Check browser console (F12) for errors and verify:
1. API endpoint URLs match backend routes
2. JWT tokens are stored correctly in localStorage
3. CORS is enabled on backend

### Chart Display Issues
Ensure Chart.js library is loaded:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

## Support

For issues or questions, refer to:
- Backend logs: `npm run dev` output
- Frontend errors: Browser console (F12)
- Database queries: MySQL Workbench
