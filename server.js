const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'sakthi_hr_secret_key_change_in_prod';

// Standard 8-hour shift slots
const TIME_SLOTS = [
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 01:00 PM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM",
    "04:00 PM - 05:00 PM",
    "05:00 PM - 06:00 PM"
];

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve specifically only the necessary static directories and files to avoid exposing backend files
app.use('/hr', express.static(path.join(__dirname, 'hr')));
app.use('/invoice', express.static(path.join(__dirname, 'invoice')));
app.use('/links', express.static(path.join(__dirname, 'links')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
            // Enhanced employees table
            db.run(`CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'employee',
                designation TEXT,
                joining_date TEXT
            )`);

            // Hourly schedule tracks assignments and statuses
            db.run(`CREATE TABLE IF NOT EXISTS hourly_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER,
                date TEXT NOT NULL,
                hour_slot TEXT NOT NULL,
                admin_task TEXT,
                status TEXT DEFAULT 'Yet to start',
                remarks TEXT,
                UNIQUE(employee_id, date, hour_slot),
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            )`);

            // Seed default admin if the table is empty
            db.get(`SELECT COUNT(*) as count FROM employees`, async (err, row) => {
                if (row.count === 0) {
                    const adminHash = await bcrypt.hash('Sakthi@123', 10);
                    const todayDate = new Date().toISOString().split('T')[0];

                    const stmt = db.prepare(`INSERT INTO employees (name, email, password_hash, role, designation, joining_date) VALUES (?, ?, ?, ?, ?, ?)`);
                    stmt.run('Administrator', 'admin@sakthiconsultancy.com', adminHash, 'admin', 'System Administrator', todayDate);
                    stmt.finalize();
                    console.log('Seeded master admin@sakthiconsultancy.com');
                }
            });
        });
    }
});

// Helper for JWT authentication
const authenticateToken = (req, res, next) => {
    const token = req.cookies.hr_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

const restrictToAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ========================
// API ROUTES
// ========================

// Ensure the root path resolves correctly if requested directly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. AUTH API
app.post('/hr/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM employees WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '12h' });
        res.cookie('hr_token', token, { httpOnly: true, secure: false, maxAge: 12 * 60 * 60 * 1000 });
        res.json({ message: 'Logged in successfully' });
    });
});

app.get('/hr/api/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, name, email, role, designation, joining_date FROM employees WHERE id = ?`, [req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'User not found' });
        res.json({ user: row });
    });
});

app.post('/hr/api/auth/logout', (req, res) => {
    res.clearCookie('hr_token');
    res.json({ message: 'Logged out' });
});

// 2. EMPLOYEES LIST (For Admin to select and assign)
app.get('/hr/api/employees', authenticateToken, restrictToAdmin, (req, res) => {
    db.all(`SELECT id, name, designation FROM employees WHERE role = 'employee'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ employees: rows });
    });
});

// 2b. CREATE EMPLOYEE (Admin Only)
app.post('/hr/api/employees', authenticateToken, restrictToAdmin, async (req, res) => {
    const { name, email, password, designation, joining_date } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO employees (name, email, password_hash, role, designation, joining_date) VALUES (?, ?, ?, 'employee', ?, ?)`,
        [name, email, hash, designation, joining_date], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Employee created successfully', id: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to hash password' });
    }
});

// 3. SCHEDULE FETCH
app.get('/hr/api/schedule', authenticateToken, (req, res) => {
    // Admin can specify employee_id. Employees can only get their own.
    const employee_id = req.user.role === 'admin' && req.query.employee_id ? req.query.employee_id : req.user.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    db.all(`SELECT hour_slot, admin_task, status, remarks FROM hourly_schedule WHERE employee_id = ? AND date = ? ORDER BY id ASC`, 
    [employee_id, date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // If no schedule exists, return a blank template
        if (rows.length === 0) {
            const blankSchedule = TIME_SLOTS.map(slot => ({
                hour_slot: slot, admin_task: '', status: 'Yet to start', remarks: ''
            }));
            return res.json({ date, schedule: blankSchedule });
        }
        res.json({ date, schedule: rows });
    });
});

// 4. ADMIN ASSIGN TASKS
app.post('/hr/api/schedule/admin', authenticateToken, restrictToAdmin, (req, res) => {
    const { employee_id, date, tasks } = req.body; // tasks is an array [{hour_slot, admin_task}]
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        tasks.forEach(task => {
            // Upsert mechanism: If row exists, update admin_task. Else insert.
            db.run(`INSERT INTO hourly_schedule (employee_id, date, hour_slot, admin_task) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(employee_id, date, hour_slot) DO UPDATE SET admin_task = excluded.admin_task`,
            [employee_id, date, task.hour_slot, task.admin_task]);
        });
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: 'Transaction failed' });
            res.json({ message: 'Tasks assigned successfully' });
        });
    });
});

// 5. EMPLOYEE UPDATE STATUS & REMARKS
app.post('/hr/api/schedule/employee', authenticateToken, (req, res) => {
    const { date, updates } = req.body; // updates is array [{hour_slot, status, remarks}]
    const employee_id = req.user.id; // Enforce security

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        updates.forEach(update => {
            // Upsert mechanism. Note: If admin hasn't created the row, employee can still create it to log their work
            db.run(`INSERT INTO hourly_schedule (employee_id, date, hour_slot, status, remarks) 
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(employee_id, date, hour_slot) DO UPDATE SET status = excluded.status, remarks = excluded.remarks`,
            [employee_id, date, update.hour_slot, update.status, update.remarks]);
        });
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: 'Transaction failed' });
            res.json({ message: 'Status updated successfully' });
        });
    });
});

// 6. OVERARCHING REPORTS (Admin)
app.get('/hr/api/reports', authenticateToken, restrictToAdmin, (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Summary of employee daily progress (e.g., checking if they have filled any hours)
    const query = `
        SELECT 
            e.id as employee_id, 
            e.name as employee_name,
            COUNT(h.id) as hours_logged,
            SUM(CASE WHEN h.status = 'Completed' THEN 1 ELSE 0 END) as tasks_completed
        FROM employees e
        LEFT JOIN hourly_schedule h ON e.id = h.employee_id AND h.date = ? 
        WHERE e.role = 'employee'
        GROUP BY e.id
    `;

    db.all(query, [date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Format the report response
        const reports = rows.map(r => ({
            employee_id: r.employee_id,
            employee_name: r.employee_name,
            hours_logged: r.hours_logged,
            status: r.hours_logged === 0 ? 'Absent/No Logs' : `${r.tasks_completed} Tasks Completed`
        }));
        res.json({ date, reports });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
