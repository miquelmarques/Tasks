const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const newTaskNameInput = document.getElementById('new-task-name');
const newTaskDateInput = document.getElementById('new-task-date');
const addTaskBtn = document.getElementById('add-task-btn');
const adminTasksContainer = document.getElementById('admin-tasks-container');

// Cargar tasques inicials
window.onload = async () => {
    // Protecció d'accés
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verificar admin
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();
        
    if (!profile || !profile.is_admin) {
        alert("No tens permisos per accedir a la gestió de tasques.");
        window.location.href = 'index.html';
        return;
    }
    
    loadAdminTasks();
};

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
        
        const dateStr = task.due_date ? new Date(task.due_date).toLocaleString('ca-ES') : 'Sense data';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 600;">${task.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">📅 ${dateStr}</span>
                </div>
                <button class="btn-logout" style="padding: 5px 10px; font-size: 0.7rem;" data-id="${task.id}">Eliminar</button>
            </div>
        `;

        div.querySelector('button').addEventListener('click', () => deleteTask(task.id));
        adminTasksContainer.appendChild(div);
    });
}

async function addTask() {
    const name = newTaskNameInput.value.trim();
    const dueDateValue = newTaskDateInput.value;

    if (!name || !dueDateValue) {
        alert("Si us plau, ompliu tant el nom com la data de la tasca.");
        return;
    }

    // Convertir a formato ISO para asegurar que Supabase lo guarde correctamente
    const dueDate = new Date(dueDateValue).toISOString();

    const { error } = await supabaseClient
        .from('tasks')
        .insert([{ name, due_date: dueDate }]);

    if (error) {
        alert("Error afegint la tasca: " + error.message);
    } else {
        newTaskNameInput.value = "";
        newTaskDateInput.value = "";
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
