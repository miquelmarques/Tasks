const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUserId = null;
let isAdminUser = false;
let allTasks = [];
let allProgress = [];
let calendar = null;

function toLocalInputValue(date){ if(!date) return ''; const d=new Date(date); const offsetMs=d.getTimezoneOffset()*60000; return new Date(d.getTime()-offsetMs).toISOString().slice(0,16); }

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    const userEmailSpan = document.getElementById('user-email');

    document.getElementById('logout-btn')?.addEventListener('click', async () => { await supabaseClient.auth.signOut(); location.reload(); });
    document.getElementById('close-modal-btn')?.addEventListener('click', () => { document.getElementById('task-modal').style.display='none'; });
    document.getElementById('save-task-btn')?.addEventListener('click', handleSaveTask);
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.style.borderColor='transparent');
            option.style.borderColor='#000';
            document.getElementById('task-color').value = option.dataset.color;
        });
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { authSection.style.display='grid'; return; }
    currentUserId = session.user.id;
    userEmailSpan.textContent = session.user.email;
    authSection.style.display='none';
    mainSection.style.display='block';

    try {
        const { data: isAdmin } = await supabaseClient.rpc('check_if_admin');
        isAdminUser = (isAdmin === true);
    } catch(e){}

    await loadAppData();
    initCalendar();
});

async function loadAppData() {
    const { data: tasks } = await supabaseClient.from('tasks').select('*').or(`user_id.eq.${currentUserId},user_id.is.null`).order('due_date',{ascending:true});
    const { data: progress } = await supabaseClient.from('user_tasks').select('*').eq('user_id', currentUserId);
    allTasks = tasks || [];
    allProgress = progress || [];
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(buildEvents());
    }
}

function buildEvents() {
    return allTasks.filter(t => t.due_date).map(task => {
        const prog = allProgress.find(p => p.task_id === task.id);
        const completed = prog ? prog.completed : false;
        const color = (prog && prog.color) ? prog.color : (task.color || (completed ? '#94a3b8' : '#3b82f6'));
        return {
            id: String(task.id),
            title: task.name + (completed ? ' ✓' : ''),
            start: task.due_date,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { task, progress: prog }
        };
    });
}

function initCalendar() {
    const el = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: 'ca',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        editable: true,
        eventClick: (info) => {
            const task = info.event.extendedProps.task;
            const prog = info.event.extendedProps.progress;
            const personalColor = (prog && prog.color) ? prog.color : task.color;
            const personalLink = (prog && prog.personal_link_url) ? prog.personal_link_url : task.link_url;
            const canEditFull = isAdminUser || task.user_id === currentUserId;
            openTaskModal(task.id, task.name, task.due_date, personalColor, canEditFull, personalLink);
        },
        eventChange: async (info) => {
            const task = info.event.extendedProps.task;
            const canEditFull = isAdminUser || task.user_id === currentUserId;
            if (!canEditFull) { info.revert(); return; }
            const newDate = info.event.start.toISOString();
            try {
                await supabaseClient.from('tasks').update({ due_date: newDate }).eq('id', task.id);
                await loadAppData();
            } catch(e){ info.revert(); }
        }
    });
    calendar.addEventSource(buildEvents());
    calendar.render();
}

function openTaskModal(id, name, date, color, canEditFull, link) {
    document.getElementById('task-id').value = id || '';
    document.getElementById('task-name').value = name || '';
    document.getElementById('task-date').value = date ? toLocalInputValue(date) : '';
    document.getElementById('task-link').value = link || '';
    document.getElementById('task-color').value = color || '';
    document.querySelectorAll('.color-option').forEach(o => o.style.borderColor = (o.dataset.color === color)?'#000':'transparent');
    document.getElementById('task-name').disabled = !canEditFull;
    document.getElementById('task-date').disabled = !canEditFull;
    document.getElementById('modal-title').textContent = canEditFull ? (id?'Editar tasca':'Nova tasca') : 'Personalitzar la teva tasca';
    document.getElementById('task-modal').style.display='flex';
}

async function handleSaveTask() {
    const id = document.getElementById('task-id').value;
    const name = document.getElementById('task-name').value.trim();
    const dueDate = document.getElementById('task-date').value;
    const color = document.getElementById('task-color').value;
    const linkUrl = document.getElementById('task-link').value.trim();
    if (!name) { alert('Introdueix un nom.'); return; }
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessio caducada.');
        const dueDateIso = dueDate ? new Date(dueDate).toISOString() : null;
        if (id) {
            await supabaseClient.from('user_tasks').upsert({
                user_id: session.user.id, task_id: parseInt(id,10),
                color, personal_link_url: linkUrl
            }, { onConflict: 'user_id,task_id' });
            const canEditFull = isAdminUser || await checkTaskOwnership(id);
            if (canEditFull) {
                await supabaseClient.from('tasks').update({ name, due_date: dueDateIso }).eq('id', id);
            }
        } else {
            const { data: newTask } = await supabaseClient.from('tasks').insert([{ name, due_date: dueDateIso, user_id: session.user.id }]).select().single();
            await supabaseClient.from('user_tasks').insert([{ user_id: session.user.id, task_id: newTask.id, color, personal_link_url: linkUrl }]);
        }
        document.getElementById('task-modal').style.display='none';
        await loadAppData();
    } catch(e) {
        console.error(e);
        alert('Error guardant la tasca: ' + (e.message || e));
    }
}

async function checkTaskOwnership(taskId) {
    const { data } = await supabaseClient.from('tasks').select('user_id').eq('id', taskId).single();
    return data && data.user_id === currentUserId;
}
