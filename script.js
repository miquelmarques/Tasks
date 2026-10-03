const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmailSpan = document.getElementById('user-email');
const tasksContainer = document.getElementById('tasks-container');

loginBtn.addEventListener('click', handleLogin);
signupBtn.addEventListener('//click', handleSignUp);
logoutBtn.addEventListener('click', handleLogout);

async function handleSignUp() {
    const email = emailInput.value;
    const password = passwordInput.value;
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Compte creat! Revisa el teu correu per confirmar.");
}

async function handleLogin() {
    const email = emailInput.value;
    const password = passwordInput.value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkUser();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    checkUser();
}

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        if (authSection) authSection.style.display = 'none';
        if (mainSection) mainSection.style.display = 'block';
        userEmailSpan.textContent = session.user.email;
        await checkAdminStatus(session.user.id);
        await loadAppData(session.user.id);
    } else {
        if (authSection) authSection.style.display = 'grid';
        if (mainSection) mainSection.style.display = 'none';
    }
}

async function checkAdminStatus(userId) {
    try {
        const { data: isAdmin, error } = await supabaseClient.rpc('check_if_admin');
        if (error) throw error;

        if (isAdmin === true) {
            const userBar = document.querySelector('.user-bar');
            if (!userBar || document.getElementById('admin-link')) return;

            const adminBtn = document.createElement('a');
            adminBtn.id = 'admin-link';
            adminBtn.href = 'admin.html';
            adminBtn.textContent = '➕ Afegeix una tasca';
            adminBtn.className = 'btn-admin';

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) userBar.insertBefore(adminBtn, logoutBtn);
            else userBar.appendChild(adminBtn);
        }
    } catch (e) {
        console.log("Admin check failed", e);
    }
}

async function loadAppData(userId) {
    try {
        const { data: tasks, error: taskError } = await supabaseClient
            .from('tasks')
            .select('*')
            .order('id', { ascending: true });

        if (taskError) throw taskError;

        const { data: progress, error: progError } = await supabaseClient
            .from('user_tasks')
            .select('*')
            .eq('user_id', userId);

        if (progError) throw progError;

        renderTasks(tasks || [], progress || []);
    } catch (error) {
        console.error(error);
        alert("Error carregant les dades.");
    }
}

function renderTasks(tasks, progress) {
    tasksContainer.innerHTML = "";
    if (!tasks || tasks.length === 0) {
        tasksContainer.innerHTML = '<div class="empty-state">No hi ha tasques assignades.</div>';
        return;
    }

    tasks.forEach(task => {
        const userProgress = progress.find(p => p.task_id === task.id);
        const isChecked = userProgress ? userProgress.completed : false;
        
        let dateHtml = '';
        if (task.due_date) {
            const dueDate = new Date(task.due_date).toLocaleString('ca-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric', 
                hour: '2-digit', minute: '2-digit'
            });
            // Vermell si no està feta, gris si ja està feta
            dateHtml = `<span style="color: ${isChecked ? 'var(--text-muted)' : 'var(--danger)'}; font-weight: 600; font-size: 0.75rem;">
                            📅 Data límit: ${dueDate}
                        </span>`;
        }

        const div = document.createElement('div');
        div.className = 'task-item';
        
        let metaHtml = '';
        if (isChecked && userProgress) {
            metaHtml = `
                <div class="task-meta">
                    ${userProgress.document_url ? `<a href="${userProgress.document_url}" target="_blank" class="doc-link">🔗 Veure document entregat</a>` : ''}
                </div>`;
        }

        div.innerHTML = `
            <div class="task-main">
                <input type="checkbox" ${isChecked ? 'checked' : ''} data-task-id="${task.id}">
                <div style="display: flex; flex-direction: column;">
                    <span>${task.name}</span>
                    ${dateHtml}
                </div>
            </div>
            ${metaHtml}
        `;

        div.querySelector('input').addEventListener('change', async (e) => {
            let docUrl = '';
            if (e.target.checked) {
                docUrl = prompt("Introduïu l'URL del document de la tasca (ex: Google Drive):");
                if (!docUrl) {
                    e.target.checked = false;
                    return;
                }
            }
            await toggleTask(e.target.dataset.taskId, e.target.checked, docUrl);
        });
        tasksContainer.appendChild(div);
    });
}

async function toggleTask(taskId, completed, docUrl = null) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session.user.id;

    try {
        const { error } = await supabaseClient
            .from('user_tasks')
            .upsert({ 
                user_id: userId, 
                task_id: parseInt(taskId), 
                completed: completed,
                document_url: completed ? docUrl : null,
                updated_at: new Date() 
            });
        if (error) throw error;
        window.location.reload();
    } catch (error) {
        console.error(error);
        alert("Error actualitzant la tasca.");
    }
}

checkUser();
