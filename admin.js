const SUPABASE_URL = 'https://lwoobofrqovfbrdksayz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oIRnKNsYFB_us0Sun5fMsA_yetvg0sI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const newTaskNameInput = document.getElementById('new-task-name');
const newTaskDateInput = document.getElementById('new-task-date');
const addTaskBtn = document.getElementById('add-task-btn');
const adminTasksContainer = document.getElementById('admin-tasks-container');
const csvFileInput = document.getElementById('csv-file');
const uploadCsvBtn = document.getElementById('upload-csv-btn');

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

addTaskBtn.addEventListener('click', addTask);
uploadCsvBtn.addEventListener('click', handleCSVUpload);
