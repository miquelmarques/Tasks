// ════════════════════════════════════════════════════════════
// admin.js — Panell d'Administració ASIX2A
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM refs - Tasks
const newTaskTypeSelect = document.getElementById('new-task-type');
const groupSelectGroup = document.getElementById('group-select-group');
const newTaskGroupSelect = document.getElementById('new-task-group');
const newTaskNameInput = document.getElementById('new-task-name');
const newTaskDateInput = document.getElementById('new-task-date');
const newTaskLinkInput = document.getElementById('new-task-link');
const addTaskBtn = document.getElementById('add-task-btn');
const adminTasksContainer = document.getElementById('admin-tasks-container');
const csvFileInput = document.getElementById('csv-file');
const uploadCsvBtn = document.getElementById('upload-csv-btn');

// DOM refs - Groups
const newGroupNameInput = document.getElementById('new-group-name');
const newGroupDescInput = document.getElementById('new-group-desc');
const createGroupBtn = document.getElementById('create-group-btn');
const groupsList = document.getElementById('groups-list');

// DOM refs - Edit Task Modal
const adminTaskModal = document.getElementById('admin-task-modal');
const adminTaskIdInput = document.getElementById('admin-task-id');
const adminTaskNameInput = document.getElementById('admin-task-name');
const adminTaskTypeSelect = document.getElementById('admin-task-type');
const adminGroupSelectGroup = document.getElementById('admin-group-select-group');
const adminTaskGroupSelect = document.getElementById('admin-task-group');
const adminTaskDateInput = document.getElementById('admin-task-date');
const adminTaskLinkInput = document.getElementById('admin-task-link');
const adminSaveTaskBtn = document.getElementById('admin-save-task-btn');
const adminCloseModalBtn = document.getElementById('admin-close-modal-btn');

// DOM refs - Add Member Modal
const addMemberModal = document.getElementById('add-member-modal');
const memberGroupIdInput = document.getElementById('member-group-id');
const memberUserSelect = document.getElementById('member-user-select');
const memberIsAdminCheckbox = document.getElementById('member-is-admin');
const saveMemberBtn = document.getElementById('save-member-btn');
const closeMemberModalBtn = document.getElementById('close-member-modal-btn');

let currentAdminUserId = null;
let isGlobalAdmin = false;
let myAdminGroupIds = [];
let cachedGroups = [];
let cachedUsers = [];

// ── Helpers ─────────────────────────────────────────────
function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Sense data';
    const parts = String(dateStr).substring(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Init ────────────────────────────────────────────────
window.onload = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    currentAdminUserId = session.user.id;
    document.getElementById('admin-user-email').textContent = session.user.email;

    // Verify admin: Global Admin or Group Admin
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

    isGlobalAdmin = (profile && profile.is_admin === true);

    const { data: adminMemberships } = await supabaseClient
        .from('task_group_members')
        .select('group_id')
        .eq('user_id', session.user.id)
        .eq('is_admin', true);

    myAdminGroupIds = (adminMemberships || []).map(m => m.group_id);
    const isGroupAdmin = myAdminGroupIds.length > 0;

    if (!isGlobalAdmin && !isGroupAdmin) {
        alert("No tens permisos d'administrador ni gestor de grup.");
        window.location.href = 'index.html';
        return;
    }

    // Configurar opcions segons permisos
    if (!isGlobalAdmin) {
        const titleEl = document.getElementById('admin-header-title');
        const subEl = document.getElementById('admin-header-subtitle');
        if (titleEl) titleEl.textContent = '👥 Gestió del teu Grup';
        if (subEl) subEl.textContent = 'Afegeix alumnes al teu grup i gestiona les tasques de grup';

        // Ocultar pujada massiva CSV per a administradors de grup
        const csvSec = document.getElementById('csv-upload-section');
        if (csvSec) csvSec.style.display = 'none';

        // Ocultar formulari de creació de nou grup
        const createGroupCard = document.getElementById('create-group-card');
        if (createGroupCard) createGroupCard.style.display = 'none';

        // Tipus de tasca disponibles per a gestor de grup
        newTaskTypeSelect.innerHTML = `
            <option value="group">👥 Grupal (per al teu grup)</option>
            <option value="personal">👤 Personal</option>
        `;
        groupSelectGroup.style.display = 'flex';

        // Personalitzar títols de pestanyes
        const tabTasks = document.getElementById('tab-btn-tasks');
        const tabGroups = document.getElementById('tab-btn-groups');
        if (tabTasks) tabTasks.textContent = '📋 Tasques del Grup';
        if (tabGroups) tabGroups.textContent = '👥 Membres del Grup';
    } else {
        newTaskTypeSelect.innerHTML = `
            <option value="global">🌍 Global (per a tota la classe)</option>
            <option value="group">👥 Grupal (per a un grup concret)</option>
            <option value="personal">👤 Personal</option>
        `;
    }

    // Tab switcher
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('tasks-tab').style.display = target === 'tasks-tab' ? 'block' : 'none';
            document.getElementById('groups-tab').style.display = target === 'groups-tab' ? 'block' : 'none';
        });
    });

    // Toggle group selector based on task type
    newTaskTypeSelect.addEventListener('change', () => {
        groupSelectGroup.style.display = newTaskTypeSelect.value === 'group' ? 'flex' : 'none';
    });
    adminTaskTypeSelect.addEventListener('change', () => {
        adminGroupSelectGroup.style.display = adminTaskTypeSelect.value === 'group' ? 'flex' : 'none';
    });

    // Task event listeners
    addTaskBtn.addEventListener('click', addTask);
    uploadCsvBtn.addEventListener('click', handleCSVUpload);
    adminSaveTaskBtn.addEventListener('click', saveAdminTask);
    adminCloseModalBtn.addEventListener('click', () => { adminTaskModal.style.display = 'none'; });

    // Group event listeners
    createGroupBtn.addEventListener('click', createGroup);
    saveMemberBtn.addEventListener('click', saveMember);
    closeMemberModalBtn.addEventListener('click', () => { addMemberModal.style.display = 'none'; });

    await loadAll();
};

async function loadAll() {
    await Promise.all([loadGroups(), loadUsers()]);
    await loadAdminTasks();
    renderGroups();
}

// ── Tasks Management ────────────────────────────────────
async function loadAdminTasks() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }
    let filtered = tasks || [];
    filtered = filtered.filter(t => {
        const isPersonal = t.task_type === 'personal' || (!t.task_type && t.user_id && !t.group_id);
        if (isPersonal && t.user_id !== currentAdminUserId) return false;
        if (!isGlobalAdmin) {
            return myAdminGroupIds.includes(t.group_id) || (t.task_type === 'personal' && t.user_id === currentAdminUserId);
        }
        return true;
    });
    renderAdminTasks(filtered);
}

function renderAdminTasks(tasks) {
    adminTasksContainer.innerHTML = "";
    if (tasks.length === 0) {
        adminTasksContainer.innerHTML = '<div class="empty-state">No hi ha tasques creades.</div>';
        return;
    }

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item';

        const typeLabels = { global: '🌍 Global', group: '👥 Grupal', personal: '👤 Personal' };
        const typeBadge = `<span class="task-type-badge ${task.task_type}">${typeLabels[task.task_type] || task.task_type}</span>`;

        let groupInfo = '';
        if (task.group_id) {
            const grp = cachedGroups.find(g => g.id === task.group_id);
            if (grp) groupInfo = `<span style="font-size:0.75rem;color:var(--text-muted);">📂 ${escapeHtml(grp.name)}</span>`;
        }

        const dateStr = formatDateDisplay(task.due_date);

        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                <div style="display:flex;flex-direction:column;flex:1;gap:3px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:600;">${escapeHtml(task.name)}</span>
                        ${task.link_url ? `<a href="${escapeHtml(task.link_url)}" target="_blank" class="link-btn">🔗</a>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:0.75rem;color:var(--text-muted);">📅 ${dateStr}</span>
                        ${typeBadge}
                        ${groupInfo}
                    </div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit" style="padding:5px 10px;font-size:0.75rem;background:var(--bg-color);border:1px solid var(--border);border-radius:6px;cursor:pointer;">✏️</button>
                    <button class="btn-delete" style="padding:5px 10px;font-size:0.75rem;background:var(--danger-light);color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;">🗑️</button>
                </div>
            </div>
        `;

        div.querySelector('.btn-edit').addEventListener('click', () => openEditModal(task));
        div.querySelector('.btn-delete').addEventListener('click', () => deleteTask(task.id));
        adminTasksContainer.appendChild(div);
    });
}

async function addTask() {
    const name = newTaskNameInput.value.trim();
    const dueDate = newTaskDateInput.value; // YYYY-MM-DD
    const linkUrl = newTaskLinkInput.value.trim();
    const taskType = newTaskTypeSelect.value;
    const groupId = newTaskGroupSelect.value ? parseInt(newTaskGroupSelect.value) : null;

    if (!name) { alert("Introdueix el nom de la tasca."); return; }
    if (taskType === 'group' && !groupId) { alert("Selecciona un grup per a la tasca grupal."); return; }

    const insertPayload = {
        name,
        due_date: dueDate || null,
        link_url: linkUrl || null,
        task_type: taskType,
        group_id: taskType === 'group' ? groupId : null,
        user_id: currentAdminUserId
    };

    const { error } = await supabaseClient.from('tasks').insert([insertPayload]);
    if (error) {
        alert("Error afegint la tasca: " + error.message);
    } else {
        newTaskNameInput.value = "";
        newTaskDateInput.value = "";
        newTaskLinkInput.value = "";
        loadAdminTasks();
    }
}

async function deleteTask(id) {
    if (!confirm("Eliminar aquesta tasca per a tothom?")) return;
    const { error } = await supabaseClient.from('tasks').delete().eq('id', id);
    if (error) alert("Error eliminant: " + error.message);
    else loadAdminTasks();
}

function openEditModal(task) {
    adminTaskIdInput.value = task.id;
    adminTaskNameInput.value = task.name;
    adminTaskTypeSelect.value = task.task_type || 'global';
    adminGroupSelectGroup.style.display = task.task_type === 'group' ? 'flex' : 'none';
    adminTaskGroupSelect.value = task.group_id || '';
    adminTaskDateInput.value = task.due_date ? String(task.due_date).substring(0, 10) : '';
    adminTaskLinkInput.value = task.link_url || '';
    adminTaskModal.style.display = 'flex';
}

async function saveAdminTask() {
    const id = adminTaskIdInput.value;
    const name = adminTaskNameInput.value.trim();
    const taskType = adminTaskTypeSelect.value;
    const groupId = adminTaskGroupSelect.value ? parseInt(adminTaskGroupSelect.value) : null;
    const dueDate = adminTaskDateInput.value;
    const linkUrl = adminTaskLinkInput.value.trim();

    if (!name) { alert("El nom és obligatori."); return; }

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({
                name,
                task_type: taskType,
                group_id: taskType === 'group' ? groupId : null,
                due_date: dueDate || null,
                link_url: linkUrl || null
            })
            .eq('id', parseInt(id));

        if (error) throw error;
        adminTaskModal.style.display = 'none';
        loadAdminTasks();
    } catch (e) {
        alert("Error actualitzant: " + (e.message || e));
    }
}

// ── CSV Upload ──────────────────────────────────────────
async function handleCSVUpload() {
    const file = csvFileInput.files[0];
    if (!file) { alert("Selecciona un fitxer CSV."); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
        const tasksToInsert = [];

        lines.forEach((line, index) => {
            // format: name,date,type
            const parts = line.split(',').map(s => s.trim());
            const name = parts[0];
            const dueDate = parts[1] || null;
            const taskType = (parts[2] && ['global', 'group', 'personal'].includes(parts[2])) ? parts[2] : 'global';

            if (name) {
                tasksToInsert.push({
                    name,
                    due_date: dueDate ? dueDate.substring(0, 10) : null,
                    task_type: taskType,
                    user_id: currentAdminUserId
                });
            }
        });

        if (tasksToInsert.length === 0) {
            alert("No s'han trobat dades vàlides al CSV.");
            return;
        }

        if (!confirm(`Es crearan ${tasksToInsert.length} tasques. Vols continuar?`)) return;

        const { error } = await supabaseClient.from('tasks').insert(tasksToInsert);
        if (error) {
            alert("Error pujant CSV: " + error.message);
        } else {
            alert(`✅ ${tasksToInsert.length} tasques afegides.`);
            csvFileInput.value = "";
            loadAdminTasks();
        }
    };
    reader.readAsText(file);
}

// ── Groups Management ───────────────────────────────────
async function loadGroups() {
    const { data: groups, error } = await supabaseClient
        .from('task_groups')
        .select('*, task_group_members(id, user_id, is_admin)')
        .order('id', { ascending: true });

    if (error) { console.error("Error carregant grups:", error); return; }
    cachedGroups = groups || [];

    // Populate group selects
    populateGroupSelects();
}

function populateGroupSelects() {
    const visibleGroups = isGlobalAdmin 
        ? cachedGroups 
        : cachedGroups.filter(g => myAdminGroupIds.includes(g.id));

    const opts = visibleGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    newTaskGroupSelect.innerHTML = '<option value="">— Selecciona un grup —</option>' + opts;
    adminTaskGroupSelect.innerHTML = '<option value="">— Selecciona un grup —</option>' + opts;
}

async function loadUsers() {
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('*');

    if (error) { console.error("Error carregant perfils:", error); return; }
    cachedUsers = profiles || [];
}

function renderGroups() {
    groupsList.innerHTML = '';
    const visibleGroups = isGlobalAdmin 
        ? cachedGroups 
        : cachedGroups.filter(g => myAdminGroupIds.includes(g.id));

    if (visibleGroups.length === 0) {
        groupsList.innerHTML = '<div class="empty-state">No tens grups assignats per administrar.</div>';
        return;
    }

    visibleGroups.forEach(grp => {
        const card = document.createElement('div');
        card.className = 'group-card';

        const members = grp.task_group_members || [];
        const membersHtml = members.map(m => {
            const user = cachedUsers.find(u => u.id === m.user_id);
            const email = user ? (user.email || user.display_name) : m.user_id.substring(0, 8);
            const adminBadge = m.is_admin ? '⭐ Admin' : '';
            return `
                <span class="member-chip ${m.is_admin ? 'admin' : ''}">
                    ${escapeHtml(email)} ${adminBadge}
                    <span class="remove-member" data-member-id="${m.id}" title="Eliminar">&times;</span>
                </span>
            `;
        }).join('');

        const deleteBtnHtml = isGlobalAdmin 
            ? `<button class="btn-delete-group" style="padding:4px 10px;font-size:0.75rem;background:var(--danger-light);color:var(--danger);border:1px solid var(--danger);box-shadow:none;" data-group-id="${grp.id}">🗑️</button>` 
            : '';

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h4>📂 ${escapeHtml(grp.name)}</h4>
                <div style="display:flex;gap:6px;">
                    <button class="btn-add-member" style="padding:4px 10px;font-size:0.75rem;" data-group-id="${grp.id}">➕ Afegir Membre</button>
                    ${deleteBtnHtml}
                </div>
            </div>
            ${grp.description ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(grp.description)}</p>` : ''}
            <div style="margin-top:10px;">
                <label style="font-size:0.75rem;">Membres (${members.length}):</label>
                <div class="member-list">${membersHtml || '<span style="font-size:0.78rem;color:var(--text-muted);">Cap membre afegit.</span>'}</div>
            </div>
        `;

        card.querySelector('.btn-add-member').addEventListener('click', () => openAddMemberModal(grp.id));
        if (isGlobalAdmin && card.querySelector('.btn-delete-group')) {
            card.querySelector('.btn-delete-group').addEventListener('click', () => deleteGroup(grp.id));
        }
        card.querySelectorAll('.remove-member').forEach(rm => {
            rm.addEventListener('click', () => removeMember(rm.dataset.memberId));
        });

        groupsList.appendChild(card);
    });
}

async function createGroup() {
    const name = newGroupNameInput.value.trim();
    const desc = newGroupDescInput.value.trim();
    if (!name) { alert("Introdueix un nom per al grup."); return; }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session?.user?.id || currentAdminUserId;

    const { data, error } = await supabaseClient
        .from('task_groups')
        .insert([{ name, description: desc, created_by: userId }])
        .select();

    if (error) {
        console.error("Error detallat creant grup:", error);
        alert("Error creant el grup: " + (error.message || error.details || JSON.stringify(error)));
    } else {
        newGroupNameInput.value = '';
        newGroupDescInput.value = '';
        await loadGroups();
        renderGroups();
    }
}

async function deleteGroup(groupId) {
    if (!confirm("Eliminar aquest grup? Les tasques associades es desvincularan.")) return;
    const { error } = await supabaseClient.from('task_groups').delete().eq('id', groupId);
    if (error) alert("Error eliminant el grup: " + error.message);
    else {
        await loadGroups();
        renderGroups();
    }
}

function openAddMemberModal(groupId) {
    memberGroupIdInput.value = groupId;
    memberUserSelect.innerHTML = '<option value="">— Selecciona usuari —</option>';

    // Obtenir membres actuals per evitar duplicats al selector
    const grp = cachedGroups.find(g => g.id === groupId);
    const existingMemberIds = new Set((grp?.task_group_members || []).map(m => m.user_id));

    const availableUsers = cachedUsers.filter(u => !existingMemberIds.has(u.id));

    availableUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        const label = u.display_name ? `${u.email || u.id} (${u.display_name})` : (u.email || u.id);
        opt.textContent = label;
        memberUserSelect.appendChild(opt);
    });

    if (availableUsers.length === 0) {
        memberUserSelect.innerHTML = '<option value="">Tots els alumnes ja formen part del grup</option>';
    }

    memberIsAdminCheckbox.checked = false;
    addMemberModal.style.display = 'flex';
}

async function saveMember() {
    const groupId = parseInt(memberGroupIdInput.value);
    const userId = memberUserSelect.value;
    const isAdmin = memberIsAdminCheckbox.checked;

    if (!userId) { alert("Selecciona un usuari."); return; }

    const { error } = await supabaseClient
        .from('task_group_members')
        .insert([{ group_id: groupId, user_id: userId, is_admin: isAdmin }]);

    if (error) {
        alert("Error afegint membre: " + error.message);
    } else {
        addMemberModal.style.display = 'none';
        await loadGroups();
        renderGroups();
    }
}

async function removeMember(memberId) {
    if (!confirm("Treure aquest usuari del grup?")) return;
    const { error } = await supabaseClient.from('task_group_members').delete().eq('id', memberId);
    if (error) alert("Error eliminant membre: " + error.message);
    else {
        await loadGroups();
        renderGroups();
    }
}
