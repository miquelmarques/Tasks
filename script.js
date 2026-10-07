const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Elements
let authSection, mainSection, emailInput, passwordInput, loginBtn, signupBtn, logoutBtn, userEmailSpan, tasksContainer;
let addPersonalTaskBtn, personalTaskModal, personalTaskNameInput, personalTaskDateInput, savePersonalTaskBtn, closeModalBtn;

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
    personalTaskModal = document.getElementById('personal-task-modal');
    personalTaskNameInput = document.getElementById('personal-task-name');
    personalTaskDateInput = document.getElementById('personal-task-date');
    savePersonalTaskBtn = document.getElementById('save-personal-task-btn');
    closeModalBtn = document.getElementById('close-modal-btn');

    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    if (addPersonalTaskBtn && personalTaskModal) {
        addPersonalTaskBtn.addEventListener('click', () => {
            personalTaskModal.style.display = 'flex';
        });
    }
    if (closeModalBtn && personalTaskModal) {
        closeModalBtn.addEventListener('click', () => {
            personalTaskModal.style.display = 'none';
        });
    }
    if (savePersonalTaskBtn) {
        savePersonalTaskBtn.addEventListener('click', handleSavePersonalTask);
    }

    checkUser();
});

async function handleSignUp() {
    const email = emailInput.value;
    const password = passwordInput.value;
    
    if (!email || !password) {
        alert("Si us plau, omple tots els camps.");
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) {
        console.error("Error de registre:", error);
        alert("Error: " + error.message);
    } else {
        if (data.session) {
            alert("Compte creat amb èxit! Ja pots accedir.");
            checkUser(); // Això amagarà el formulari i mostrarà les tasques
        } else {
            alert("Compte creat! Revisa el teu correu per confirmar.");
        }
    }
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
        // Carregar tasques globals (user_id és null) i tasques personals de l'usuari
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
        alert("Error carregant les dades.");
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

    // 1. Filtrar tasques: desapareixen 7 dies després de la data de venciment
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

    // 2. Classificar tasques per categories
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
        } else {
            const dueDate = new Date(task.due_date);
            if (dueDate < now) {
                categories.overdue.tasks.push(task);
            } else {
                categories.upcoming.tasks.push(task);
            }
        }
    });

    // 3. Renderitzar cada categoria
    Object.values(categories).forEach(cat => {
        if (cat.tasks.length === 0) return;

        // Títol de la categoria
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = cat.title;
        sectionTitle.style.cssText = "font-size: 1.1rem; margin: 25px 0 10px 0; color: var(--text-main); font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;";
        tasksContainer.appendChild(sectionTitle);

        cat.tasks.forEach(task => {
            const userProgress = progress.find(p => p.task_id === task.id);
            const isChecked = userProgress ? userProgress.completed : false;
            
            let dateHtml = '';
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
                
                const dateString = dueDate.toLocaleString('ca-ES', {
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit'
                });

                let color = isChecked ? 'var(--text-muted)' : 'var(--danger)';
                let weight = isChecked ? '400' : '700';
                let prefix = '📅 Data de venciment: ';

                if (!isChecked && diffDays <= 1) {
                    color = '#f59e0b'; 
                    prefix = '⚠️ AVISE! Venciment: ';
                }

                dateHtml = `<span style="color: ${color}; font-weight: ${weight}; font-size: 0.75rem; display: block; margin-top: 4px;">
                                ${prefix}${dateString}
                            </span>`;
            } else {
                dateHtml = `<span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 4px;">
                                📅 Sense data límit
                            </span>`;
            }

            const div = document.createElement('div');
            div.className = 'task-item';
            
            // Fons vermell si està vencuda i no completada
            if (!isChecked && task.due_date && new Date(task.due_date) < now) {
                div.style.backgroundColor = '#fee2e2'; // Vermell molt clar
                div.style.borderColor = 'var(--danger)';
            }
            
            div.innerHTML = `
                <div class="task-main">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} data-task-id="${task.id}">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600;">${task.name}</span>
                        ${dateHtml}
                    </div>
                </div>
            `;

            div.querySelector('input').addEventListener('change', async (e) => {
                await toggleTask(e.target.dataset.taskId, e.target.checked);
            });
            tasksContainer.appendChild(div);
        });
    });
}

async function toggleTask(taskId, completed, docUrl = null) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session.user.id;

    try {
        const { error } = await supabaseClient
            .from('user_tasks') // Corrigint l'error de la barra
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

async function handleSavePersonalTask() {
    const name = personalTaskNameInput.value;
    const dueDate = personalTaskDateInput.value;
    
    if (!name) {
        alert("Si us plau, introdueix un nom per a la tasca.");
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session.user.id;

    try {
        // 1. Crear la tasca al taulari 'tasks' vinculada a l'usuari
        const { data: newTask, error: taskError } = await supabaseClient
            .from('tasks')
            .insert([
                { 
                    name: name, 
                    due_date: dueDate || null, 
                    user_id: userId 
                }
            ])
            .select();

        if (taskError) throw taskError;

        // Tancar modal i netejar
        personalTaskModal.style.display = 'none';
        personalTaskNameInput.value = '';
        personalTaskDateInput.value = '';

        // Recarregar la pàgina per veure la nova tasca
        window.location.reload();
    } catch (error) {
        console.error(error);
        alert("Error creant la tasca personal: " + error.message);
    }
}
