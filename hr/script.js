document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentUser = null;

    // Elements
    const views = document.querySelectorAll('.view');
    const userControls = document.getElementById('user-controls');
    const headerUserName = document.getElementById('header-user-name');
    const headerUserRole = document.getElementById('header-user-role');
    
    // Check Authentication on load
    checkAuth();

    // Setup Date Displays
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = 'Today: ' + new Date().toLocaleDateString('en-US', options);
    document.getElementById('report-date').value = new Date().toISOString().split('T')[0];

    // Listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('status-form').addEventListener('submit', handleStatusSubmit);
    document.getElementById('report-date').addEventListener('change', fetchAdminReports);
    document.getElementById('export-btn').addEventListener('click', exportToCSV);

    // Functions
    function showView(viewId) {
        views.forEach(v => v.classList.remove('section-active'));
        document.getElementById(viewId).classList.add('section-active');
    }

    async function checkAuth() {
        try {
            const res = await fetch('/hr/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
                updateHeader();
                
                if (currentUser.role === 'admin') {
                    showView('admin-view');
                    fetchAdminReports();
                } else {
                    showView('employee-view');
                    fetchTodayStatus();
                }
            } else {
                showView('login-view');
                userControls.style.display = 'none';
            }
        } catch (e) {
            console.error(e);
            showView('login-view');
        }
    }

    function updateHeader() {
        userControls.style.display = 'flex';
        headerUserName.textContent = currentUser.name;
        headerUserRole.textContent = currentUser.role;
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const res = await fetch('/hr/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                errorDiv.textContent = '';
                checkAuth(); // Reload state
            } else {
                errorDiv.textContent = data.error || 'Login failed';
            }
        } catch (err) {
            errorDiv.textContent = 'Server error. Please try again.';
        }
    }

    async function handleLogout() {
        await fetch('/hr/api/auth/logout', { method: 'POST' });
        currentUser = null;
        userControls.style.display = 'none';
        
        // Reset forms
        document.getElementById('login-form').reset();
        document.getElementById('status-form').reset();
        document.getElementById('status-submitted-alert').style.display = 'none';
        
        showView('login-view');
    }

    async function handleStatusSubmit(e) {
        e.preventDefault();
        const status = document.getElementById('work-status').value;
        const notes = document.getElementById('work-notes').value;
        
        const btn = document.getElementById('submit-status-btn');
        btn.disabled = true;
        btn.innerHTML = 'Submitting...';

        try {
            const res = await fetch('/hr/api/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, notes })
            });

            if (res.ok) {
                document.getElementById('status-submitted-alert').style.display = 'flex';
            }
        } catch (err) {
            console.error(err);
            alert('Failed to submit status.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Update Status <i class="fa-solid fa-paper-plane"></i>';
        }
    }

    async function fetchTodayStatus() {
        try {
            const res = await fetch('/hr/api/status/today');
            if (res.ok) {
                const data = await res.json();
                if (data.status) {
                    document.getElementById('work-status').value = data.status.status;
                    document.getElementById('work-notes').value = data.status.notes || '';
                    document.getElementById('status-submitted-alert').style.display = 'flex';
                    document.getElementById('submit-status-btn').innerHTML = 'Update Status <i class="fa-solid fa-paper-plane"></i>';
                }
            }
        } catch (err) {
            console.error('Error fetching status', err);
        }
    }

    async function fetchAdminReports() {
        const date = document.getElementById('report-date').value;
        const tbody = document.getElementById('reports-tbody');
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';

        try {
            const res = await fetch(`/hr/api/reports?date=${date}`);
            if (res.ok) {
                const data = await res.json();
                renderTable(data.reports);
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Failed to load reports</td></tr>';
        }
    }

    function renderTable(reports) {
        const tbody = document.getElementById('reports-tbody');
        tbody.innerHTML = '';

        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center">No employee records found.</td></tr>';
            return;
        }

        reports.forEach(r => {
            const tr = document.createElement('tr');
            
            let statusClass = 'status-present';
            if (r.status === 'Absent') statusClass = 'status-absent';
            else if (r.status.includes('Leave')) statusClass = 'status-leave';

            tr.innerHTML = `
                <td><strong>${r.employee_name}</strong></td>
                <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                <td>${r.notes || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function exportToCSV() {
        const date = document.getElementById('report-date').value;
        const rows = document.querySelectorAll('#reports-tbody tr');
        let csvContent = "data:text/csv;charset=utf-8,Employee,Status,Notes\n";

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length === 3) {
                const name = cols[0].innerText.replace(/"/g, '""');
                const status = cols[1].innerText.replace(/"/g, '""');
                const notes = cols[2].innerText.replace(/"/g, '""');
                csvContent += `"${name}","${status}","${notes}"\n`;
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_report_${date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});
