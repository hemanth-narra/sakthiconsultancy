const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'sakthi_hr_secret_key_change_in_prod';

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
            db.run(`CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'employee'
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS work_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            )`);

            // Seed default users if the table is empty
            db.get(`SELECT COUNT(*) as count FROM employees`, async (err, row) => {
                if (row.count === 0) {
                    const adminHash = await bcrypt.hash('Admin@123', 10);
                    const empHash = await bcrypt.hash('Employee@123', 10);

                    const stmt = db.prepare(`INSERT INTO employees (name, email, password_hash, role) VALUES (?, ?, ?, ?)`);
                    stmt.run('Admin User', 'admin@sakthi.com', adminHash, 'admin');
                    stmt.run('Test Employee', 'employee@sakthi.com', empHash, 'employee');
                    stmt.finalize();
                    console.log('Seeded initial admin@sakthi.com and employee@sakthi.com');
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

// Auto-absent checking logic
// Simply runs whenever a status or report is checked for the current date logic.
const checkAndMarkAbsences = () => {
    // A robust system would run this via node-cron daily.
    // For simplicity, we just mark past missed days on fetch if necessary.
    // But inserting "Absent" rows up to today can be tricky. Let's just do it directly.
    const today = new Date().toISOString().split('T')[0];
    
    // Select all employees, then check if they have a record for yesterday (or loop through last 7 days).
    // For this simple implementation, the reports query handles absent states via LEFT JOIN if we generate dates.
    // However, SQLite doesn't have an easy generate_series. 
    // We will do a simple approach: whenever an admin pulls report, we don't insert, we just query available data.
}

// Ensure the root path resolves correctly if requested directly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// AUTH API
app.post('/hr/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM employees WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
        
        // Secure in prod, false for local dev via HTTP
        res.cookie('hr_token', token, { httpOnly: true, secure: false, maxAge: 12 * 60 * 60 * 1000 });
        res.json({ message: 'Logged in successfully', user: { id: user.id, name: user.name, role: user.role, email: user.email } });
    });
});

app.get('/hr/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

app.post('/hr/api/auth/logout', (req, res) => {
    res.clearCookie('hr_token');
    res.json({ message: 'Logged out' });
});

// STATUS API
app.post('/hr/api/status', authenticateToken, (req, res) => {
    const { status, notes } = req.body;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const employee_id = req.user.id;

    // Check if submitting for today already exists
    db.get(`SELECT id FROM work_status WHERE employee_id = ? AND date = ?`, [employee_id, date], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Update
            db.run(`UPDATE work_status SET status = ?, notes = ? WHERE id = ?`, [status, notes, row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Status updated successfully' });
            });
        } else {
            // Insert
            db.run(`INSERT INTO work_status (employee_id, date, status, notes) VALUES (?, ?, ?, ?)`, [employee_id, date, status, notes], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Status submitted successfully' });
            });
        }
    });
});

app.get('/hr/api/status/today', authenticateToken, (req, res) => {
    const date = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM work_status WHERE employee_id = ? AND date = ?`, [req.user.id, date], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: row || null });
    });
});

// REPORTS API (Admin)
// Get all statuses or a specific date/date range
app.get('/hr/api/reports', authenticateToken, restrictToAdmin, (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // We want to return a list of all employees and their status for the given date.
    // If no work_status row exists, status is "No Status/Absent"
    const query = `
        SELECT 
            e.id as employee_id, 
            e.name as employee_name, 
            COALESCE(w.status, 'Absent') as status,
            w.notes
        FROM employees e
        LEFT JOIN work_status w ON e.id = w.employee_id AND w.date = ?
        WHERE e.role = 'employee'
    `;

    db.all(query, [date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ date, reports: rows });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
