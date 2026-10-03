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
signupBtn.addEventListener('click', handleSignUp);
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
        authSection.style.display = 'none';
        mainSection.style.display = 'block';
        userEmailSpan.textContent = session.user.email;
        
        // Executem amb await per assegurar l'ordre
        await checkAdminStatus(session.user.id);
        await loadAppData(session.user.id);
    } else {
        authSection.style.display = 'grid';
        mainSection.style.display = 'none';
    }
}

async function checkAdminStatus(userId) {
    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .maybeSingle(); // .maybeSingle() no llança error si no troba la fila

        if (profile && profile.is_admin) {
            const adminBtn = document.createElement('a');
            adminBtn.href = 'admin.html';
            adminBtn.textContent = '⚙️ Panel Admin';
            adminBtn.style.cssText = 'background: var(--primary); color: white; padding: 5px 10px; border-radius: 5px; text-decoration: none; font-size: 0.8rem; font-weight: 600; margin-right: 10px;';
            
            const userBar = document.querySelector('.user-bar');
            if (userBar) userBar.insertBefore(adminBtn, logoutBtn);
        }
    } catch (e) {
        console.log("No s'ha pogut determinar el rol d'admin, s'assumeix usuari estàndard.");
    }
}

async function loadAppData(userId) {
    try {
        // 1. Carregar tasques
        const { data: tasks, error: taskError } = await supabaseClient
            .from('tasks')
            .select('*')
            .order('id', { ascending: true });

        if (taskError) throw taskError;
        if (!tasks) throw new Error("No s'han trobat tasques al curs.");

        // 2. Carregar progrés (Si és buit, retorna [])
        const { data: progress, error: progError } = await supabaseClient
            .from('user_tasks')
            .select('*')
            .eq('user_id', userId);

        if (progError) throw progError;

        renderTasks(tasks, progress || []);
    } catch (error) {
        console.error("Error detallat:", error);
        alert("Error carregant les dades. Comprava que la taula 'tasks' tingui contingut.");
    }
}

function renderTasks(tasks, progress) {
    tasksContainer.innerHTML = "";
    if (!tasks || tasks.length === 0) {
        tasksContainer.innerHTML = '<div class="empty-state">No hi ha tasques assignades per al curs.</div>';
        return;
    }

    tasks.forEach(task => {
        // Protecció: si progress és null, fem que sigui una llista buida
        const safeProgress = progress || [];
        const userProgress = safeProgress.find(p => p.task_id === task.id);
        const isChecked = userProgress ? userProgress.completed : false;

        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''} data-task-id="${task.id}">
            <span>${task.name}</span>
        `;

        div.querySelector('input').addEventListener('change', (e) => {
            toggleTask(e.target.dataset.taskId, e.target.checked);
        });
        tasksContainer.appendChild(div);
    });
}

async function toggleTask(taskId, completed) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session.user.id;

    try {
        const { error } = await supabaseClient
            .from('user_tasks')
            .upsert({ 
                user_id: userId, 
                task_id: parseInt(taskId), 
                completed: completed,
                updated_at: new Date() 
            });
        if (error) throw error;
    } catch (error) {
        console.error(error);
        alert("Error actualitzant la tasca.");
    }
}

checkUser();
