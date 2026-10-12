const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

if (SUPABASE_URL === '__SUPABASE_URL__' || SUPABASE_KEY === '__SUPABASE_KEY__') {
    console.error("❌ ERROR: Les variables de Supabase no s'han injectat. Si estàs provant la web localment, recorda que has de posar les claus manualment o desplegar a GitHub Pages.");
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const newTaskNameInput = document.getElementById('new-task-name');
const newTaskDateInput = document.getElementById('new-task-date');
const addTaskBtn = document.getElementById('add-task-btn');
const adminTasksContainer = document.getElementById('admin-tasks-container');
const csvFileInput = document.getElementById('csv-file');
const uploadCsvBtn = document.getElementById('upload-csv-btn');

// Modal Edició
const adminTaskModal = document.getElementById('admin-task-modal');
const adminTaskIdInput = document.getElementById('admin-task-id');
const adminTaskNameInput = document.getElementById('admin-task-name');
const adminTaskDateInput = document.getElementById('admin-task-date');
const adminSaveTaskBtn = document.getElementById('admin-save-task-btn');
const adminCloseModalBtn = document.getElementById('admin-close-modal-btn');

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
                <div style="display: flex; flex-direction: column; flex: 1;">
                    <span style="font-weight: 600;">${task.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">📅 ${dateStr}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-edit" style="padding: 5px 10px; font-size: 0.7rem; cursor: pointer; background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px;" data-id="${task.id}">Editar</button>
                    <button class="btn-logout" style="padding: 5px 10px; font-size: 0.7rem;" data-id="${task.id}">Eliminar</button>
                </div>
            </div>
        `;

        div.querySelector('.btn-logout').addEventListener('click', () => deleteTask(task.id));
        div.querySelector('.btn-edit').addEventListener('click', () => openEditModal(task));
        adminTasksContainer.appendChild(div);
    });
}

async function addTask() {
    const name = newTaskNameInput.value.trim();
    const dueDate = newTaskDateInput.value; // Tomamos el valor directo del input (YYYY-MM-DDTHH:mm)

    if (!name || !dueDate) {
        alert("Si us plau, ompliu tant el nom com la data de la tasca.");
        return;
    }

    // Enviamos la fecha tal cual viene del input, Supabase/Postgres lo entiende perfectamente
    const { error } = await supabaseClient
        .from('tasks')
        .insert([{ name, due_date: dueDate }]);

    if (error) {
        console.error("Error detallat:", error);
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

async function handleCSVUpload() {
    const file = csvFileInput.files[0];
    if (!file) {
        alert("Si us plau, selecciona un fitxer CSV.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        
        const tasksToInsert = [];
        
        // Processem cada línia (nom, data)
        lines.forEach((line, index) => {
            const [name, dueDate] = line.split(',').map(item => item.trim());
            if (name && dueDate) {
                tasksToInsert.push({ name, due_date: dueDate });
            } else {
                console.warn(`Línia ${index + 1} ignorada per format incorrecte: ${line}`);
            }
        });

        if (tasksToInsert.length === 0) {
            alert("No s'han trobat dades vàlides al fitxer CSV.");
            return;
        }

        if (!confirm(`Es pujaran ${tasksToInsert.length} tasques. Vols continuar?`)) return;

        const { error } = await supabaseClient
            .from('tasks')
            .insert(tasksToInsert);

        if (error) {
            alert("Error pujant el CSV: " + error.message);
        } else {
            alert(`✅ S'han afegit ${tasksToInsert.length} tasques correctament.`);
            csvFileInput.value = "";
            loadAdminTasks();
        }
    };

    reader.readAsText(file);
}

function openEditModal(task) {
    adminTaskIdInput.value = task.id;
    adminTaskNameInput.value = task.name;
    if (task.due_date) {
        const d = new Date(task.due_date);
        adminTaskDateInput.value = d.toISOString().slice(0, 16);
    } else {
        adminTaskDateInput.value = '';
    }
    adminTaskModal.style.display = 'flex';
}

async function saveAdminTask() {
    const id = adminTaskIdInput.value;
    const name = adminTaskNameInput.value.trim();
    const dueDate = adminTaskDateInput.value;

    console.log("Admin intentant guardar tasca:", { id, name, dueDate });

    if (!name) {
        alert("El nom de la tasca és obligatori.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ name, due_date: dueDate || null })
            .eq('id', parseInt(id)); // Assegurar que l'ID és un número

        if (error) throw error;

        console.log("Tasca admin actualitzada correctament!");
        adminTaskModal.style.display = 'none';
        loadAdminTasks();
    } catch (error) {
        console.error("Error detallat admin:", error);
        alert("Error actualitzant la tasca: " + error.message);
    }
}

addTaskBtn.addEventListener('click', addTask);
uploadCsvBtn.addEventListener('click', handleCSVUpload);

// Modals
adminSaveTaskBtn.addEventListener('click', saveAdminTask);
adminCloseModalBtn.addEventListener('click', () => {
    adminTaskModal.style.display = 'none';
});
