const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const newTaskInput = document.getElementById('new-task-name');
const addTaskBtn = document.getElementById('add-task-btn');
const adminTasksContainer = document.getElementById('admin-tasks-container');

async function initAdmin() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        alert("Has d'iniciar sessió per accedir aquí.");
        window.location.href = 'index.html';
        return;
    }

    // Verificar si l'usuari és administrador
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

    if (error || !profile || !profile.is_admin) {
        alert("No tens permisos d'administrador.");
        window.location.href = 'index.html';
        return;
    }

    loadAdminTasks();
}

async function loadAdminTasks() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    renderAdminTasks(tasks);
}

function renderAdminTasks(tasks) {
    adminTasksContainer.innerHTML = "";
    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <span style="flex: 1;">${task.name}</span>
            <button class="btn-logout" style="padding: 5px 10px; font-size: 0.7rem;" data-id="${task.id}">Eliminar</button>
        `;

        div.querySelector('button').addEventListener('click', () => deleteTask(task.id));
        adminTasksContainer.appendChild(div);
    });
}

async function addTask() {
    const name = newTaskInput.value.trim();
    if (!name) return;

    const { error } = await supabaseClient
        .from('tasks')
        .insert([{ name }]);

    if (error) {
        alert("Error afegint la tasca: " + error.message);
    } else {
        newTaskInput.value = "";
        loadAdminTasks();
    }
}

async function deleteTask(id) {
    if (!confirm("Estàs segur que vols eliminar aquesta tasca?")) return;

    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Error eliminant la tasca: " + error.message);
    } else {
        loadAdminTasks();
    }
}

addTaskBtn.addEventListener('click', addTask);
initAdmin();
