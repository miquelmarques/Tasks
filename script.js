// CONFIGURACIÓ SUPABASE
const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Elements DOM
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmailSpan = document.getElementById('user-email');
const tasksContainer = document.getElementById('tasks-container');

// Eventos de Autenticació
loginBtn.addEventListener('click', handleLogin);
signupBtn.addEventListener('click', handleSignUp);
logoutBtn.addEventListener('click', handleLogout);

async function handleSignUp() {
    const email = emailInput.value;
    const password = passwordInput.value;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Compte creat! Revisa el teu correu per confirmar.");
}

async function handleLogin() {
    const email = emailInput.value;
    const password = passwordInput.value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkUser();
}

async function handleLogout() {
    await supabase.auth.signOut();
    checkUser();
}

async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        authSection.style.display = 'none';
        mainSection.style.display = 'block';
        userEmailSpan.textContent = session.user.email;
        loadAppData(session.user.id);
    } else {
        authSection.style.display = 'grid';
        mainSection.style.display = 'none';
    }
}

async function loadAppData(userId) {
    try {
        // 1. Carregar totes les tasques
        const { data: tasks, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .order('id', { ascending: true });

        if (taskError) throw taskError;

        // 2. Carregar el progrés de l'usuari
        const { data: progress, error: progError } = await supabase
            .from('user_tasks')
            .select('*')
            .eq('user_id', userId);

        if (progError) throw progError;

        renderTasks(tasks, progress);
    } catch (error) {
        console.error(error);
        alert("Error carregant les dades.");
    }
}

function renderTasks(tasks, progress) {
    tasksContainer.innerHTML = "";
    
    tasks.forEach(task => {
        const userProgress = progress.find(p => p.task_id === task.id);
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
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session.user.id;

    try {
        // Upsert: Si existeix l'actualitza, si no la crea
        const { error } = await supabase
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

// Iniciar app
checkUser();
