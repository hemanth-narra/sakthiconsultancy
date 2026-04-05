document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentUser = null;
    let timeSlotsMaster = [];

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
    const todayISO = new Date().toISOString().split('T')[0];
    document.getElementById('report-date').value = todayISO;
    document.getElementById('assign-date').value = todayISO;

    // Listeners (Auth)
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Listeners (Employee)
    document.getElementById('submit-schedule-btn')?.addEventListener('click', saveEmployeeSchedule);

    // Listeners (Admin)
    document.getElementById('report-date')?.addEventListener('change', fetchAdminReports);
    document.getElementById('load-assign-btn')?.addEventListener('click', loadAdminAssignmentGrid);
    document.getElementById('save-assignments-btn')?.addEventListener('click', saveAdminAssignments);
    document.getElementById('create-employee-form')?.addEventListener('submit', handleCreateEmployee);

    // Document-level Listeners (Tabs & Modals)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-tab'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.add('active-tab');
        });
    });

    document.querySelector('.close-modal')?.addEventListener('click', () => {
        document.getElementById('breakdown-modal').style.display = 'none';
    });

    // --- Core Functions ---
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
                    loadEmployeesDropdown();
                    loadAllTasks();
                } else {
                    showView('employee-view');
                    renderEmployeeProfile();
                    loadEmployeeSchedule();
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

    function renderEmployeeProfile() {
        document.getElementById('profile-name').textContent = currentUser.name;
        document.getElementById('profile-designation').textContent = currentUser.designation || 'Employee';
        document.getElementById('profile-mobile').textContent = currentUser.mobile || 'N/A';
        document.getElementById('profile-joined').textContent = currentUser.joining_date || 'N/A';
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
        document.getElementById('status-submitted-alert').style.display = 'none';
        
        showView('login-view');
    }

    // --- Employee Logic ---

    async function loadEmployeeSchedule() {
        const date = new Date().toISOString().split('T')[0];
        try {
            const res = await fetch(`/hr/api/schedule?date=${date}`);
            const data = await res.json();
            
            const tbody = document.getElementById('employee-schedule-tbody');
            tbody.innerHTML = '';
            
            timeSlotsMaster = data.schedule.map(s => s.hour_slot); // Keep reference to slots

            data.schedule.forEach((slot, index) => {
                const tr = document.createElement('tr');
                
                tr.innerHTML = `
                    <td>
                        <span class="time-slot-label"><i class="fa-regular fa-clock" style="margin-right: 6px;"></i> ${slot.hour_slot}</span>
                        <input type="hidden" name="slot" value="${slot.hour_slot}">
                    </td>
                    <td>
                        <div class="admin-task-cell">${slot.admin_task || '<i>No specific task assigned</i>'}</div>
                    </td>
                    <td>
                        <select class="form-control status-select">
                            <option value="Yet to start" ${slot.status === 'Yet to start' ? 'selected' : ''}>Yet to start</option>
                            <option value="Work-in-progress" ${slot.status === 'Work-in-progress' ? 'selected' : ''}>Work-in-progress</option>
                            <option value="Completed" ${slot.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </td>
                    <td>
                        <textarea class="form-control remarks-input" rows="2" placeholder="Write progress or 'Lunch'">${slot.remarks || ''}</textarea>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to load schedule', err);
        }
    }

    async function saveEmployeeSchedule() {
        const btn = document.getElementById('submit-schedule-btn');
        btn.disabled = true;
        btn.innerHTML = 'Saving...';
        
        const date = new Date().toISOString().split('T')[0];
        const tbody = document.getElementById('employee-schedule-tbody');
        const rows = tbody.querySelectorAll('tr');
        
        const updates = Array.from(rows).map(row => {
            return {
                hour_slot: row.querySelector('input[name="slot"]').value,
                status: row.querySelector('.status-select').value,
                remarks: row.querySelector('.remarks-input').value
            };
        });

        try {
            const res = await fetch('/hr/api/schedule/employee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, updates })
            });

            if (res.ok) {
                document.getElementById('status-submitted-alert').style.display = 'flex';
                setTimeout(() => { document.getElementById('status-submitted-alert').style.display = 'none'; }, 3000);
            }
        } catch (err) {
            alert('Failed to save updates');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Day\'s Work <i class="fa-solid fa-paper-plane"></i>';
        }
    }

    // --- Admin Logic ---

    async function loadEmployeesDropdown() {
        try {
            const res = await fetch('/hr/api/employees');
            const data = await res.json();
            const select = document.getElementById('assign-employee-select');
            select.innerHTML = '';
            data.employees.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.name} (${e.designation || 'Employee'})`;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error("Failed loading employees list");
        }
    }

    async function loadAdminAssignmentGrid() {
        const employee_id = document.getElementById('assign-employee-select').value;
        const date = document.getElementById('assign-date').value;
        
        if (!employee_id || !date) return;

        try {
            const res = await fetch(`/hr/api/schedule?employee_id=${employee_id}&date=${date}`);
            const data = await res.json();
            
            const tbody = document.getElementById('admin-schedule-tbody');
            tbody.innerHTML = '';
            
            data.schedule.forEach(slot => {
                const statusBadgeMap = {
                    'Yet to start': 'status-absent',
                    'Work-in-progress': 'status-wip',
                    'Completed': 'status-completed'
                };
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="time-slot-label">${slot.hour_slot}</span>
                        <input type="hidden" name="admin-slot" value="${slot.hour_slot}">
                    </td>
                    <td>
                        <textarea class="form-control admin-task-input" rows="2" placeholder="Assign task or leave blank">${slot.admin_task || ''}</textarea>
                    </td>
                    <td>
                        <span class="status-badge ${statusBadgeMap[slot.status] || ''}">${slot.status}</span>
                        <p style="font-size: 0.85rem; color: #666; margin-top: 0.4rem;"><b>Remarks:</b> ${slot.remarks || '<i>None</i>'}</p>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            document.getElementById('assignment-grid-container').style.display = 'block';
            document.getElementById('assign-success').style.display = 'none';

        } catch (err) {
            console.error(err);
        }
    }

    async function saveAdminAssignments() {
        const employee_id = document.getElementById('assign-employee-select').value;
        const date = document.getElementById('assign-date').value;
        
        const rows = document.querySelectorAll('#admin-schedule-tbody tr');
        const tasks = Array.from(rows).map(row => ({
            hour_slot: row.querySelector('input[name="admin-slot"]').value,
            admin_task: row.querySelector('.admin-task-input').value
        }));

        try {
            const res = await fetch('/hr/api/schedule/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id, date, tasks })
            });

            if (res.ok) {
                document.getElementById('assign-success').style.display = 'block';
                setTimeout(() => { document.getElementById('assign-success').style.display = 'none'; }, 3000);
            }
        } catch (err) {
            alert("Failed to assign tasks.");
        }
    }

    async function handleCreateEmployee(e) {
        e.preventDefault();
        const btn = document.getElementById('create-emp-btn');
        const errorDiv = document.getElementById('create-emp-error');
        const successDiv = document.getElementById('create-emp-success');
        
        btn.disabled = true;
        btn.innerHTML = 'Creating...';
        errorDiv.textContent = '';
        successDiv.style.display = 'none';

        const payload = {
            name: document.getElementById('new-emp-name').value,
            email: document.getElementById('new-emp-email').value,
            mobile: document.getElementById('new-emp-mobile').value,
            password: document.getElementById('new-emp-pass').value,
            designation: document.getElementById('new-emp-desig').value,
            joining_date: document.getElementById('new-emp-date').value
        };

        try {
            const res = await fetch('/hr/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                successDiv.style.display = 'block';
                document.getElementById('create-employee-form').reset();
                loadEmployeesDropdown();
                setTimeout(() => { successDiv.style.display = 'none'; }, 4000);
            } else {
                errorDiv.textContent = data.error || 'Failed to create employee';
            }
        } catch (err) {
            errorDiv.textContent = 'Server error.';
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Create Employee Profile';
        }
    }

    async function fetchAdminReports() {
        const date = document.getElementById('report-date').value;
        const tbody = document.getElementById('reports-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

        try {
            const res = await fetch(`/hr/api/reports?date=${date}`);
            const data = await res.json();
            
            tbody.innerHTML = '';
            if (data.reports.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">No employee records found.</td></tr>';
                return;
            }

            data.reports.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${r.employee_name}</strong></td>
                    <td>${r.hours_logged}/8 hours modified</td>
                    <td><span class="status-badge ${r.status.includes('Absent') ? 'status-absent' : 'status-present'}">${r.status}</span></td>
                    <td>
                        <button class="btn btn-outline view-details-btn" data-empid="${r.employee_id}" data-empname="${r.employee_name}" data-date="${date}">
                            View Breakdown
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Bind Breakdown buttons
            document.querySelectorAll('.view-details-btn').forEach(btn => {
                btn.addEventListener('click', (e) => loadBreakdownModal(e.target.dataset.empid, e.target.dataset.empname, e.target.dataset.date));
            });

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load reports</td></tr>';
        }
    }

    async function loadBreakdownModal(employee_id, employee_name, date) {
        document.getElementById('modal-title').textContent = `Breakdown: ${employee_name} (${date})`;
        document.getElementById('breakdown-modal').style.display = 'flex';
        
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

        try {
            const res = await fetch(`/hr/api/schedule?employee_id=${employee_id}&date=${date}`);
            const data = await res.json();
            
            tbody.innerHTML = '';
            data.schedule.forEach(slot => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="time-slot-label">${slot.hour_slot}</td>
                    <td><div class="admin-task-cell">${slot.admin_task || '-'}</div></td>
                    <td><span class="status-badge">${slot.status}</span></td>
                    <td>${slot.remarks || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load schedule</td></tr>';
        }
    }

    async function loadAllTasks() {
        const tbody = document.getElementById('all-tasks-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
        
        try {
            const res = await fetch('/hr/api/tasks');
            const data = await res.json();
            tbody.innerHTML = '';
            
            if (data.tasks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No active tasks found in the pipeline.</td></tr>';
                return;
            }

            data.tasks.forEach(t => {
                const statusBadgeMap = {
                    'Yet to start': 'status-absent',
                    'Work-in-progress': 'status-wip',
                    'Completed': 'status-completed'
                };
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="time-slot-label">${t.date}</span><br>
                        <small style="color: #666;">${t.hour_slot}</small>
                    </td>
                    <td><strong>${t.employee_name}</strong></td>
                    <td>
                        <div class="admin-task-cell">${t.admin_task}</div>
                        ${t.remarks ? `<p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;"><b>Note:</b> ${t.remarks}</p>` : ''}
                    </td>
                    <td><span class="status-badge ${statusBadgeMap[t.status] || ''}">${t.status}</span></td>
                    <td>
                        ${t.status === 'Completed' ? 
                          `<button class="btn btn-primary generate-invoice-btn" data-id="${t.id}" style="font-size:0.75rem; padding: 0.4rem 0.8rem;">Generate Invoice</button>` 
                          : `<span style="font-size:0.8rem; color:#999;">Pending Completion</span>`}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.generate-invoice-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const taskId = e.target.dataset.id;
                    try {
                        const res = await fetch('/hr/api/tasks/invoice', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ task_id: taskId })
                        });
                        if (res.ok) {
                            loadAllTasks(); // Reload immediately so it disappears!
                            fetchAdminReports(); // Also refresh the side report counts if needed
                        }
                    } catch (err) {
                        alert("Failed to archive task");
                    }
                });
            });

        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load tasks</td></tr>';
        }
    }
});
