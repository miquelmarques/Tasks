const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

// Comprovació que no conté el placeholder literal (sed el reemplaçaria també aquí)
const configOk = SUPABASE_URL.startsWith('http') && !SUPABASE_KEY.startsWith('__');
if (!configOk) {
    console.error("❌ ERROR: Les variables de Supabase no s'han injectat. Si estàs provant la web localment, recorda que has de posar les claus manualment o desplegar a GitHub Pages.");
}

if (typeof supabase === 'undefined') {
    console.error("❌ ERROR: La llibreria supabase-js no s'ha carregat abans de script.js.");
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Elements
let authSection, mainSection, emailInput, passwordInput, loginBtn, signupBtn, logoutBtn, userEmailSpan, tasksContainer;
let addPersonalTaskBtn, taskModal, taskNameInput, taskDateInput, saveTaskBtn, closeModalBtn, taskIdInput, taskColorInput;
let currentUserId = null;
let isAdminUser = false;

// ---------- Utilitats ----------

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Converteix una data a format "YYYY-MM-DDTHH:mm" en hora LOCAL (per a <input type="datetime-local">)
function toLocalInputValue(date) {
    const d = new Date(date);
    const offsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

// ---------- Inici ----------

document.addEventListener('DOMContentLoaded', () => {
    authSection = document.getElementById('auth-section');
    mainSection = document.getElementById('main-section');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    loginBtn = document.getElementById('login-btn');
    signupBtn = document.getElementById('signup-btn');
    logoutBtn = document.getElementById('logout-btn');
    userEmailSpan = document.getElementById('user-email');
    tasksContainer = document.getElementById('tasks-container');

    addPersonalTaskBtn = document.getElementById('add-personal-task-btn');
    taskModal = document.getElementById('task-modal');
    taskNameInput = document.getElementById('task-name');
    taskDateInput = document.getElementById('task-date');
    saveTaskBtn = document.getElementById('save-task-btn');
    closeModalBtn = document.getElementById('close-modal-btn');
    taskIdInput = document.getElementById('task-id');
    taskColorInput = document.getElementById('task-color');

    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    if (addPersonalTaskBtn && taskModal) {
        addPersonalTaskBtn.addEventListener('click', () => openTaskModal());
    }
    if (closeModalBtn && taskModal) {
        closeModalBtn.addEventListener('click', () => {
            taskModal.style.display = 'none';
        });
    }
    if (saveTaskBtn) {
        saveTaskBtn.addEventListener('click', handleSaveTask);
    }

    // Lògica de selecció de color
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.style.borderColor = 'transparent');
            option.style.borderColor = '#000';
            if (taskColorInput) taskColorInput.value = option.dataset.color;
        });
    });

    checkUser();
});

// ---------- Autenticació ----------

async function handleSignUp() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("Si us plau, omple tots els camps.");
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        console.error("Error de registre:", error);
        alert("Error: " + error.message);
    } else if (data.session) {
        alert("Compte creat amb èxit! Ja pots accedir.");
        checkUser();
    } else {
        alert("Compte creat! Revisa el teu correu per confirmar.");
    }
}

async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("Si us plau, omple tots els camps.");
        return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        console.error("Error d'inici de sessió:", error);
        alert(error.message);
    } else {
        checkUser();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    checkUser();
}

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUserId = session.user.id;
        if (authSection) authSection.style.display = 'none';
        if (mainSection) mainSection.style.display = 'block';
        if (userEmailSpan) userEmailSpan.textContent = session.user.email;
        await checkAdminStatus();
        await loadAppData(session.user.id);
    } else {
        currentUserId = null;
        isAdminUser = false;
        if (authSection) authSection.style.display = 'grid';
        if (mainSection) mainSection.style.display = 'none';
    }
}

async function checkAdminStatus() {
    try {
        const { data: isAdmin, error } = await supabaseClient.rpc('check_if_admin');
        if (error) throw error;

        isAdminUser = (isAdmin === true);

        if (isAdminUser) {
            const userBar = document.querySelector('.user-bar');
            if (!userBar || document.getElementById('admin-link')) return;

            const adminBtn = document.createElement('a');
            adminBtn.id = 'admin-link';
            adminBtn.href = 'admin.html';
            adminBtn.textContent = '➕ Afegeix una tasca';
            adminBtn.className = 'btn-admin';

            const logout = document.getElementById('logout-btn');
            if (logout && logout.parentNode === userBar) userBar.insertBefore(adminBtn, logout);
            else userBar.appendChild(adminBtn);
        }
    } catch (e) {
        console.warn("Admin check failed", e);
    }
}

// ---------- Dades ----------

async function loadAppData(userId) {
    try {
        // Tasques globals (user_id null) i tasques personals de l'usuari
        const { data: tasks, error: taskError } = await supabaseClient
            .from('tasks')
            .select('*')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('due_date', { ascending: true });

        if (taskError) throw taskError;

        const { data: progress, error: progError } = await supabaseClient
            .from('user_tasks')
            .select('*')
            .eq('user_id', userId);

        if (progError) throw progError;

        renderTasks(tasks || [], progress || []);
    } catch (error) {
        console.error(error);
        alert("Error carregant les dades: " + (error.message || error));
    }
}

function renderTasks(tasks, progress) {
    tasksContainer.innerHTML = "";
    if (!tasks || tasks.length === 0) {
        tasksContainer.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px; color: #64748b;">
                <p>No hi ha tasques assignades per al curs. L'administrador ha de crear-ne.</p>
            </div>`;
        return;
    }

    const now = new Date();

    const filteredTasks = tasks.filter(task => {
        if (!task.due_date) return true;
        const dueDate = new Date(task.due_date);
        const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
        return diffDays >= -7;
    });

    if (filteredTasks.length === 0) {
        tasksContainer.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px; color: #64748b;">
                <p>No hi ha tasques actives en aquest moment.</p>
            </div>`;
        return;
    }

    const categories = {
        overdue: { title: "🔴 Vencudes / Urgents", tasks: [] },
        upcoming: { title: "📅 Pròximes", tasks: [] },
        noDate: { title: "⚪ Sense data", tasks: [] },
        completed: { title: "✅ Completades", tasks: [] }
    };

    filteredTasks.forEach(task => {
        const userProgress = progress.find(p => p.task_id === task.id);
        const isChecked = userProgress ? userProgress.completed : false;

        if (isChecked) {
            categories.completed.tasks.push(task);
        } else if (!task.due_date) {
            categories.noDate.tasks.push(task);
        } else if (new Date(task.due_date) < now) {
            categories.overdue.tasks.push(task);
        } else {
            categories.upcoming.tasks.push(task);
        }
    });

    Object.values(categories).forEach(cat => {
        if (cat.tasks.length === 0) return;

        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = cat.title;
        sectionTitle.style.cssText = "font-size: 1.1rem; margin: 25px 0 10px 0; color: var(--text-main); font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;";
        tasksContainer.appendChild(sectionTitle);

        cat.tasks.forEach(task => {
            const userProgress = progress.find(p => p.task_id === task.id);
            const isChecked = userProgress ? userProgress.completed : false;
            const personalColor = userProgress ? userProgress.color : task.color;

            let dateHtml = '';
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
                const dateString = dueDate.toLocaleString('ca-ES', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                let color = isChecked ? 'var(--text-muted)' : 'var(--danger)';
                let weight = isChecked ? '400' : '700';
                let prefix = '📅 Data de venciment: ';
                if (!isChecked && diffDays > 0 && diffDays <= 1) {
                    color = '#f59e0b';
                    prefix = '⚠️ AVÍS! Venciment: ';
                }
                dateHtml = `<span style="color: ${color}; font-weight: ${weight}; font-size: 0.75rem; display: block; margin-top: 4px;">${prefix}${dateString}</span>`;
            } else {
                dateHtml = `<span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 4px;">📅 Sense data límit</span>`;
            }

            const div = document.createElement('div');
            div.className = 'task-item';
            if (!isChecked && task.due_date && new Date(task.due_date) < now) {
                div.style.backgroundColor = '#fee2e2';
                div.style.borderColor = 'var(--danger)';
            }

            if (personalColor) {
                div.style.borderLeft = `6px solid ${personalColor}`;
            }
            
            const canEditFull = isAdminUser || task.user_id === currentUserId;
            const editBtnHtml = `<button class="edit-task-btn" style="margin-left: auto; padding: 2px 8px; font-size: 0.7rem; cursor: pointer; background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px;">✏️ Personalitzar</button>`;

            div.innerHTML = `
                <div class="task-main" style="display: flex; align-items: flex-start; width: 100%;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} data-task-id="${escapeHtml(task.id)}">
                    <div style="display: flex; flex-direction: column; flex: 1; margin-left: 10px;">
                        <span style="font-weight: 600;">${escapeHtml(task.name)}</span>
                        ${dateHtml}
                    </div>
                    ${editBtnHtml}
                </div>
            `;

            div.querySelector('input').addEventListener('change', async (e) => {
                await toggleTask(e.target.dataset.taskId, e.target.checked);
            });

            div.querySelector('.edit-task-btn').addEventListener('click', () => {
                openTaskModal(task.id, task.name, task.due_date, personalColor, canEditFull);
            });
            tasksContainer.appendChild(div);
        });
    });
}

async function toggleTask(taskId, completed, docUrl = null) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Sessió caducada. Torna a iniciar sessió.");

        // Requereix una restricció UNIQUE (user_id, task_id) a la taula user_tasks
        const { error } = await supabaseClient
            .from('user_tasks')
            .upsert({
                user_id: session.user.id,
                task_id: parseInt(taskId, 10),
                completed: completed,
                document_url: completed ? docUrl : null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,task_id' });

        if (error) throw error;
        await loadAppData(session.user.id);
    } catch (error) {
        console.error(error);
        alert("Error actualitzant la tasca: " + (error.message || error));
        if (currentUserId) await loadAppData(currentUserId);
    }
}

// ---------- Modal de tasques ----------

function openTaskModal(id = null, name = '', date = '', color = '') {
    taskIdInput.value = id || '';
    taskNameInput.value = name;
    taskDateInput.value = date ? toLocalInputValue(date) : '';

    taskColorInput.value = color || '';
    document.querySelectorAll('.color-option').forEach(option => {
        option.style.borderColor = (option.dataset.color === color) ? '#000' : 'transparent';
    });

    document.getElementById('modal-title').textContent = id ? 'Editar Tasca' : 'Nova Tasca Personal';
    taskModal.style.display = 'flex';
}

async function handleSaveTask() {
    const id = taskIdInput.value;
    const name = taskNameInput.value.trim();
    const dueDate = taskDateInput.value;
    const color = taskColorInput.value;

    if (!name) {
        alert("Si us plau, introdueix un nom per a la tasca.");
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Sessió caducada. Torna a iniciar sessió.");

        // datetime-local no porta zona horària: es converteix a ISO (UTC) abans de guardar
        const dueDateIso = dueDate ? new Date(dueDate).toISOString() : null;

        if (id) {
            const { error } = await supabaseClient
                .from('tasks')
                .update({ name, due_date: dueDateIso, color })
                .eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('tasks')
                .insert([{ name, due_date: dueDateIso, user_id: session.user.id, color }]);
            if (error) throw error;
        }

        taskModal.style.display = 'none';
        await loadAppData(session.user.id);
    } catch (error) {
        console.error(error);
        alert("Error guardant la tasca: " + (error.message || error));
    }
}