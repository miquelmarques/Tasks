// ════════════════════════════════════════════════════════════
// script.js — Dashboard de Tasques ASIX2A
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

const configOk = SUPABASE_URL.startsWith('http') && !SUPABASE_KEY.startsWith('__');
if (!configOk) {
    console.error("❌ ERROR: Les variables de Supabase no s'han injectat.");
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── State ───────────────────────────────────────────────
let currentUserId = null;
let isAdminUser = false;
let isGlobalAdmin = false;
let myAdminGroupIds = [];
let currentFilter = 'all';     // 'all' | 'global' | 'group' | 'personal'
let currentLabelFilter = null; // label id or null
let allTasks = [];
let allProgress = [];
let allLabels = [];
let allLabelAssignments = [];
let allGroups = [];

// ── DOM refs ────────────────────────────────────────────
let authSection, mainSection, emailInput, passwordInput, loginBtn, signupBtn;
let logoutBtn, userEmailSpan, tasksContainer, addPersonalTaskBtn;
let taskModal, taskNameInput, taskDateInput, taskLinkInput, saveTaskBtn;
let closeModalBtn, taskIdInput, taskColorInput, taskLabelSelect;
let labelsModal, labelsBar;

// ── Helpers ─────────────────────────────────────────────
function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    // due_date is now DATE (YYYY-MM-DD), parse as local
    const parts = String(dateStr).substring(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function formatDateDisplay(dateStr) {
    const d = formatDate(dateStr);
    if (!d) return 'Sense data';
    return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysDiff(dateStr) {
    const d = formatDate(dateStr);
    if (!d) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

// ── Init ────────────────────────────────────────────────
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
    taskModal = document.getElementById('task-modal');
    taskNameInput = document.getElementById('task-name');
    taskDateInput = document.getElementById('task-date');
    taskLinkInput = document.getElementById('task-link');
    saveTaskBtn = document.getElementById('save-task-btn');
    closeModalBtn = document.getElementById('close-modal-btn');
    taskIdInput = document.getElementById('task-id');
    taskColorInput = document.getElementById('task-color');
    taskLabelSelect = document.getElementById('task-label-select');
    labelsModal = document.getElementById('labels-modal');
    labelsBar = document.getElementById('labels-bar');

    // Auth events
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Modal events
    if (addPersonalTaskBtn) addPersonalTaskBtn.addEventListener('click', () => openTaskModal());
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => { taskModal.style.display = 'none'; });
    if (saveTaskBtn) saveTaskBtn.addEventListener('click', handleSaveTask);
    const deleteTaskModalBtn = document.getElementById('delete-task-modal-btn');
    if (deleteTaskModalBtn) deleteTaskModalBtn.addEventListener('click', handleDeleteModalTask);

    // Color selector
    document.querySelectorAll('#color-selector .color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('#color-selector .color-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            if (taskColorInput) taskColorInput.value = option.dataset.color;
        });
    });

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderTasks();
        });
    });

    // Labels modal
    const manageLabelsBtn = document.getElementById('manage-labels-btn');
    if (manageLabelsBtn) manageLabelsBtn.addEventListener('click', openLabelsModal);
    const closeLabelsBtn = document.getElementById('close-labels-modal-btn');
    if (closeLabelsBtn) closeLabelsBtn.addEventListener('click', () => { labelsModal.style.display = 'none'; });
    const addLabelBtn = document.getElementById('add-label-btn');
    if (addLabelBtn) addLabelBtn.addEventListener('click', handleAddLabel);

    checkUser();
});

// ── Auth ────────────────────────────────────────────────
async function handleSignUp() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { alert("Omple tots els camps."); return; }
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
    else if (data.session) { alert("Compte creat!"); checkUser(); }
    else { alert("Revisa el correu per confirmar."); }
}

async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { alert("Omple tots els camps."); return; }
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
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
        currentUserId = session.user.id;
        if (authSection) authSection.style.display = 'none';
        if (mainSection) mainSection.style.display = 'block';
        if (userEmailSpan) userEmailSpan.textContent = session.user.email;
        await checkAdminStatus();
        await loadAppData();
    } else {
        currentUserId = null;
        isAdminUser = false;
        if (authSection) authSection.style.display = 'grid';
        if (mainSection) mainSection.style.display = 'none';
    }
}

async function checkAdminStatus() {
    try {
        const { data: isAdmin } = await supabaseClient.rpc('check_if_admin');
        isGlobalAdmin = (isAdmin === true);

        // Comprovar si l'usuari és administrador d'algun grup
        const { data: adminMemberships } = await supabaseClient
            .from('task_group_members')
            .select('group_id')
            .eq('user_id', currentUserId)
            .eq('is_admin', true);

        myAdminGroupIds = (adminMemberships || []).map(m => m.group_id);
        const isGroupAdmin = myAdminGroupIds.length > 0;
        isAdminUser = isGlobalAdmin || isGroupAdmin;

        if (isAdminUser) {
            const navLinks = document.querySelector('.nav-links');
            if (!navLinks || document.getElementById('admin-link')) return;
            const adminBtn = document.createElement('a');
            adminBtn.id = 'admin-link';
            adminBtn.href = 'admin.html';
            adminBtn.textContent = '⚙️ Gestió';
            adminBtn.className = 'btn-admin';
            navLinks.insertBefore(adminBtn, navLinks.firstChild);
        }
    } catch (e) { console.warn("Admin check failed", e); }
}

// ── Data Loading ────────────────────────────────────────
async function loadAppData() {
    try {
        // Load tasks: RLS de PostgreSQL ja s'encarrega de filtrar segons permisos
        const { data: tasks, error: taskError } = await supabaseClient
            .from('tasks')
            .select('*')
            .order('due_date', { ascending: true });
        if (taskError) throw taskError;

        const { data: progress, error: progError } = await supabaseClient
            .from('user_tasks')
            .select('*')
            .eq('user_id', currentUserId);
        if (progError) throw progError;

        // Load labels
        const { data: labels } = await supabaseClient
            .from('task_labels')
            .select('*')
            .eq('user_id', currentUserId)
            .order('name');

        const { data: labelAssignments } = await supabaseClient
            .from('task_label_assignments')
            .select('*')
            .eq('user_id', currentUserId);

        // Load groups
        const { data: groups } = await supabaseClient
            .from('task_groups')
            .select('*, task_group_members(user_id, is_admin)');

        allTasks = tasks || [];
        allProgress = progress || [];
        allLabels = labels || [];
        allLabelAssignments = labelAssignments || [];
        allGroups = groups || [];

        renderLabelsBar();
        populateLabelSelect();
        renderTasks();
    } catch (error) {
        console.error(error);
        alert("Error carregant dades.");
    }
}

// ── Render Tasks ────────────────────────────────────────
function renderTasks() {
    tasksContainer.innerHTML = "";

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Filter personal tasks and types with strict privacy check
    let filtered = allTasks.filter(task => {
        // SEGURETAT: Una tasca personal NOMÉS és visible per al seu propietari
        const isPersonal = task.task_type === 'personal' || (!task.task_type && task.user_id);
        if (isPersonal && task.user_id !== currentUserId) {
            return false;
        }

        // Filtre per pestanya
        if (currentFilter === 'all') return true;
        return task.task_type === currentFilter;
    });

    // Filter by label
    if (currentLabelFilter) {
        const assignedTaskIds = new Set(
            allLabelAssignments
                .filter(la => la.label_id === currentLabelFilter)
                .map(la => la.task_id)
        );
        filtered = filtered.filter(task => assignedTaskIds.has(task.id));
    }

    // Hide tasks expired more than 7 days
    filtered = filtered.filter(task => {
        if (!task.due_date) return true;
        const diff = daysDiff(task.due_date);
        return diff >= -7;
    });

    if (filtered.length === 0) {
        tasksContainer.innerHTML = '<div class="empty-state">No hi ha tasques amb els filtres actuals.</div>';
        return;
    }

    // Categorize
    const categories = {
        overdue: { title: "🔴 Vencudes / Urgents", icon: "urgent", tasks: [] },
        upcoming: { title: "📅 Pròximes", icon: "upcoming", tasks: [] },
        noDate: { title: "⚪ Sense data", icon: "nodate", tasks: [] },
        completed: { title: "✅ Completades", icon: "done", tasks: [] }
    };

    filtered.forEach(task => {
        const userProg = allProgress.find(p => p.task_id === task.id);
        const isChecked = userProg ? userProg.completed : false;
        if (isChecked) {
            categories.completed.tasks.push(task);
        } else if (!task.due_date) {
            categories.noDate.tasks.push(task);
        } else {
            const diff = daysDiff(task.due_date);
            if (diff < 0) categories.overdue.tasks.push(task);
            else categories.upcoming.tasks.push(task);
        }
    });

    Object.values(categories).forEach(cat => {
        if (cat.tasks.length === 0) return;

        const titleEl = document.createElement('div');
        titleEl.className = 'section-title';
        titleEl.innerHTML = `${cat.title} <span class="badge">${cat.tasks.length}</span>`;
        tasksContainer.appendChild(titleEl);

        cat.tasks.forEach(task => {
            const userProg = allProgress.find(p => p.task_id === task.id);
            const isChecked = userProg ? userProg.completed : false;
            const personalColor = (userProg && userProg.color) ? userProg.color : task.color;
            const personalLink = (userProg && userProg.personal_link_url) ? userProg.personal_link_url : task.link_url;

            // Date display
            let dateHtml = '';
            if (task.due_date) {
                const diff = daysDiff(task.due_date);
                const dateStr = formatDateDisplay(task.due_date);
                let cls = 'normal';
                let prefix = '📅';
                if (isChecked) { cls = 'done'; }
                else if (diff < 0) { cls = 'urgent'; prefix = '🔴'; }
                else if (diff === 0) { cls = 'urgent'; prefix = '⚠️ AVUI!'; }
                else if (diff <= 2) { cls = 'warning'; prefix = '⚠️'; }
                dateHtml = `<span class="task-date ${cls}">${prefix} ${dateStr}</span>`;
            } else {
                dateHtml = '<span class="task-date normal">📅 Sense data</span>';
            }

            // Type badge
            const typeLabels = { global: '🌍 Global', group: '👥 Grupal', personal: '👤 Personal' };
            const typeBadge = `<span class="task-type-badge ${task.task_type}">${typeLabels[task.task_type] || task.task_type}</span>`;

            // Group name
            let groupName = '';
            if (task.task_type === 'group' && task.group_id) {
                const grp = allGroups.find(g => g.id === task.group_id);
                if (grp) groupName = `<span style="font-size:0.7rem;color:var(--text-muted);">📂 ${escapeHtml(grp.name)}</span>`;
            }

            // Labels
            const taskLabelIds = allLabelAssignments
                .filter(la => la.task_id === task.id)
                .map(la => la.label_id);
            const taskLabelsHtml = taskLabelIds.map(lid => {
                const lbl = allLabels.find(l => l.id === lid);
                if (!lbl) return '';
                return `<span class="task-label-tag" style="background:${escapeHtml(lbl.color)}">${escapeHtml(lbl.name)}</span>`;
            }).join('');

            // Link button
            const linkHtml = personalLink
                ? `<a href="${escapeHtml(personalLink)}" target="_blank" class="link-btn" title="Obrir enllaç">🔗</a>`
                : '';

            const div = document.createElement('div');
            div.className = `task-item${isChecked ? ' completed' : ''}`;
            if (!isChecked && task.due_date && daysDiff(task.due_date) < 0) {
                div.classList.add('overdue');
            }
            if (personalColor) div.style.borderLeft = `5px solid ${personalColor}`;

            const isGroupTaskAdmin = task.task_type === 'group' && myAdminGroupIds.includes(task.group_id);
            const canEditFull = isGlobalAdmin || task.user_id === currentUserId || isGroupTaskAdmin;

            div.innerHTML = `
                <div class="task-main">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} data-task-id="${escapeHtml(task.id)}">
                    <div class="task-info">
                        <span class="task-name">${escapeHtml(task.name)}</span>
                        <div class="task-meta-row">
                            ${dateHtml}
                            ${typeBadge}
                            ${groupName}
                            ${taskLabelsHtml}
                        </div>
                    </div>
                    <div class="task-actions">
                        ${linkHtml}
                        <button class="edit-task-btn">✏️</button>
                    </div>
                </div>
            `;

            div.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
                await toggleTask(e.target.dataset.taskId, e.target.checked);
            });

            div.querySelector('.edit-task-btn').addEventListener('click', () => {
                openTaskModal(task.id, task.name, task.due_date, personalColor, canEditFull, personalLink);
            });

            tasksContainer.appendChild(div);
        });
    });
}

// ── Toggle Task ─────────────────────────────────────────
async function toggleTask(taskId, completed) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Sessió caducada.");
        const { error } = await supabaseClient
            .from('user_tasks')
            .upsert({
                user_id: session.user.id,
                task_id: parseInt(taskId, 10),
                completed: completed,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,task_id' });
        if (error) throw error;
        await loadAppData();
    } catch (error) {
        console.error(error);
        alert("Error actualitzant la tasca.");
        if (currentUserId) await loadAppData();
    }
}

// ── Task Modal ──────────────────────────────────────────
function openTaskModal(id = null, name = '', date = '', color = '', canEditFull = true, link = '') {
    taskIdInput.value = id || '';
    taskNameInput.value = name;
    // date is now YYYY-MM-DD
    taskDateInput.value = date ? String(date).substring(0, 10) : '';
    taskLinkInput.value = link || '';
    taskColorInput.value = color || '';

    // Selector de destinació (Personal o Grups on l'usuari és admin)
    const destGroup = document.getElementById('task-dest-group');
    const destSelect = document.getElementById('task-destination');
    if (destGroup && destSelect) {
        if (!id && myAdminGroupIds.length > 0) {
            destSelect.innerHTML = '<option value="personal">👤 Tasca Personal (només per a tu)</option>';
            myAdminGroupIds.forEach(gid => {
                const grp = allGroups.find(g => g.id === gid);
                const gname = grp ? grp.name : `Grup #${gid}`;
                destSelect.innerHTML += `<option value="group_${gid}">👥 Grupal: ${escapeHtml(gname)}</option>`;
            });
            destGroup.style.display = 'flex';
        } else {
            destGroup.style.display = 'none';
        }
    }

    document.querySelectorAll('#color-selector .color-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.color === (color || ''));
    });

    taskNameInput.disabled = !canEditFull;
    taskDateInput.disabled = !canEditFull;

    // Select current label
    const currentAssignment = allLabelAssignments.find(la => la.task_id === parseInt(id));
    if (taskLabelSelect) taskLabelSelect.value = currentAssignment ? currentAssignment.label_id : '';

    if (!canEditFull) {
        document.getElementById('modal-title').textContent = 'Personalitzar la teva tasca';
    } else {
        document.getElementById('modal-title').textContent = id ? 'Editar Tasca' : 'Nova Tasca';
    }
    taskModal.style.display = 'flex';
}

async function handleSaveTask() {
    const id = taskIdInput.value;
    const name = taskNameInput.value.trim();
    const dueDate = taskDateInput.value; // YYYY-MM-DD
    const color = taskColorInput.value;
    const linkUrl = taskLinkInput.value.trim();
    const labelId = taskLabelSelect ? taskLabelSelect.value : '';

    if (!name) { alert("Introdueix un nom."); return; }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Sessió caducada.");

        if (id) {
            // Actualitzar a la taula tasks directament si es tenen permisos
            const canEditFull = isGlobalAdmin || (await checkTaskOwnership(id)) || (await checkGroupTaskAdmin(id));
            if (canEditFull) {
                const { error: taskError } = await supabaseClient
                    .from('tasks')
                    .update({
                        name,
                        due_date: dueDate || null,
                        link_url: linkUrl || null,
                        color: color || null
                    })
                    .eq('id', parseInt(id, 10));
                if (taskError) throw taskError;
            }

            // Intentar desar personalització a user_tasks de forma segura
            try {
                await supabaseClient
                    .from('user_tasks')
                    .upsert({
                        user_id: session.user.id,
                        task_id: parseInt(id, 10),
                        color: color || null,
                        personal_link_url: linkUrl || null
                    }, { onConflict: 'user_id,task_id' });
            } catch (err) {
                console.warn("user_tasks actualització omesa:", err);
            }
        } else {
            // Detectar destinació (Personal o Grupal)
            const destSelect = document.getElementById('task-destination');
            let targetType = 'personal';
            let targetGroupId = null;
            if (destSelect && destSelect.value.startsWith('group_')) {
                targetType = 'group';
                targetGroupId = parseInt(destSelect.value.replace('group_', ''), 10);
            }

            const insertPayload = {
                name,
                due_date: dueDate || null,
                user_id: session.user.id,
                task_type: targetType,
                group_id: targetGroupId,
                link_url: linkUrl || null,
                color: color || null
            };

            const { data: newTask, error: insertError } = await supabaseClient
                .from('tasks')
                .insert([insertPayload])
                .select().single();
            if (insertError) throw insertError;

            // Desar a user_tasks de forma resilient (no bloqueja si la columna personal_link_url no està creada)
            try {
                await supabaseClient
                    .from('user_tasks')
                    .insert([{
                        user_id: session.user.id,
                        task_id: newTask.id,
                        color: color || null,
                        personal_link_url: linkUrl || null
                    }]);
            } catch (err) {
                console.warn("user_tasks inserció omesa:", err);
            }
        }

        // Handle label assignment
        const taskIdNum = parseInt(id || '0', 10);
        if (taskIdNum || id) {
            const finalTaskId = taskIdNum || parseInt(id, 10);
            await supabaseClient
                .from('task_label_assignments')
                .delete()
                .eq('task_id', finalTaskId)
                .eq('user_id', session.user.id);

            if (labelId) {
                await supabaseClient
                    .from('task_label_assignments')
                    .insert([{ label_id: parseInt(labelId), task_id: finalTaskId, user_id: session.user.id }]);
            }
        }

        taskModal.style.display = 'none';
        await loadAppData();
    } catch (error) {
        console.error(error);
        alert("Error guardant la tasca: " + (error.message || error));
    }
}

async function checkGroupTaskAdmin(taskId) {
    const { data } = await supabaseClient
        .from('tasks')
        .select('task_type, group_id')
        .eq('id', taskId)
        .single();
    if (data && data.task_type === 'group' && myAdminGroupIds.includes(data.group_id)) {
        return true;
    }
    return false;
}

async function checkTaskOwnership(taskId) {
    const { data, error } = await supabaseClient
        .from('tasks')
        .select('user_id')
        .eq('id', taskId)
        .single();
    if (error) return false;
    return data.user_id === currentUserId;
}

// ── Labels ──────────────────────────────────────────────
function renderLabelsBar() {
    if (!labelsBar) return;
    if (allLabels.length === 0) {
        labelsBar.style.display = 'none';
        return;
    }
    labelsBar.style.display = 'flex';
    labelsBar.innerHTML = '<span style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-right:4px;">🏷️ Etiquetes:</span>';

    // "All" button
    const allBtn = document.createElement('div');
    allBtn.className = `filter-label-tag${currentLabelFilter === null ? ' active' : ''}`;
    allBtn.style.background = '#94a3b8';
    allBtn.textContent = 'Totes';
    allBtn.addEventListener('click', () => {
        currentLabelFilter = null;
        renderLabelsBar();
        renderTasks();
    });
    labelsBar.appendChild(allBtn);

    allLabels.forEach(lbl => {
        const tag = document.createElement('div');
        tag.className = `filter-label-tag${currentLabelFilter === lbl.id ? ' active' : ''}`;
        tag.style.background = lbl.color;
        tag.textContent = lbl.name;
        tag.addEventListener('click', () => {
            currentLabelFilter = currentLabelFilter === lbl.id ? null : lbl.id;
            renderLabelsBar();
            renderTasks();
        });
        labelsBar.appendChild(tag);
    });
}

function populateLabelSelect() {
    if (!taskLabelSelect) return;
    taskLabelSelect.innerHTML = '<option value="">— Sense etiqueta —</option>';
    allLabels.forEach(lbl => {
        const opt = document.createElement('option');
        opt.value = lbl.id;
        opt.textContent = lbl.name;
        opt.style.color = lbl.color;
        taskLabelSelect.appendChild(opt);
    });
}

function openLabelsModal() {
    const list = document.getElementById('labels-list');
    list.innerHTML = '';
    allLabels.forEach(lbl => {
        const item = document.createElement('div');
        item.className = 'label-manager-item';
        item.innerHTML = `
            <span class="task-label-tag" style="background:${escapeHtml(lbl.color)}">${escapeHtml(lbl.name)}</span>
            <span style="flex:1;"></span>
            <button class="delete-label-btn" data-id="${lbl.id}" style="padding:4px 10px;font-size:0.7rem;background:var(--danger-light);color:var(--danger);border:1px solid var(--danger);box-shadow:none;">🗑️</button>
        `;
        item.querySelector('.delete-label-btn').addEventListener('click', () => handleDeleteLabel(lbl.id));
        list.appendChild(item);
    });
    if (allLabels.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.85rem;">Encara no tens etiquetes.</p>';
    }
    labelsModal.style.display = 'flex';
}

async function handleAddLabel() {
    const nameInput = document.getElementById('new-label-name');
    const colorInput = document.getElementById('new-label-color');
    const name = nameInput.value.trim();
    const color = colorInput.value;
    if (!name) { alert("Introdueix un nom."); return; }

    try {
        const { error } = await supabaseClient
            .from('task_labels')
            .insert([{ user_id: currentUserId, name, color }]);
        if (error) throw error;
        nameInput.value = '';
        await loadAppData();
        openLabelsModal(); // refresh list
    } catch (e) {
        alert("Error creant etiqueta: " + (e.message || e));
    }
}

async function handleDeleteLabel(labelId) {
    if (!confirm("Eliminar aquesta etiqueta?")) return;
    try {
        await supabaseClient.from('task_label_assignments').delete().eq('label_id', labelId);
        await supabaseClient.from('task_labels').delete().eq('id', labelId);
        if (currentLabelFilter === labelId) currentLabelFilter = null;
        await loadAppData();
        openLabelsModal();
    } catch (e) {
        alert("Error eliminant: " + (e.message || e));
    }
}
