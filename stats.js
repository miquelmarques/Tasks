// ════════════════════════════════════════════════════════════
// stats.js — Índex Estadístic ASIX2A
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUserId = null;
let chartStatus = null;
let chartTypes = null;

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    const userEmailSpan = document.getElementById('user-email');

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        location.reload();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        authSection.style.display = 'grid';
        return;
    }

    currentUserId = session.user.id;
    userEmailSpan.textContent = session.user.email;
    authSection.style.display = 'none';
    mainSection.style.display = 'block';

    await loadStatsData();
});

function formatDate(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).substring(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

async function loadStatsData() {
    try {
        const { data: tasks } = await supabaseClient
            .from('tasks')
            .select('*');

        const { data: progress } = await supabaseClient
            .from('user_tasks')
            .select('*')
            .eq('user_id', currentUserId);

        const allTasks = tasks || [];
        const allProgress = progress || [];

        computeAndRenderStats(allTasks, allProgress);
    } catch (e) {
        console.error(e);
        alert("Error carregant estadístiques.");
    }
}

function computeAndRenderStats(tasks, progress) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const total = tasks.length;
    let completed = 0;
    let overdue = 0;
    let pending = 0;

    const byType = {
        global: { total: 0, completed: 0, label: '🌍 Globals' },
        group: { total: 0, completed: 0, label: '👥 Grupals' },
        personal: { total: 0, completed: 0, label: '👤 Personals' }
    };

    tasks.forEach(task => {
        const prog = progress.find(p => p.task_id === task.id);
        const isDone = prog ? prog.completed : false;

        const type = byType[task.task_type] ? task.task_type : 'global';
        byType[type].total++;
        if (isDone) byType[type].completed++;

        if (isDone) {
            completed++;
        } else {
            pending++;
            if (task.due_date) {
                const d = formatDate(task.due_date);
                if (d && d < now) overdue++;
            }
        }
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Update KPI numbers
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-overdue').textContent = overdue;

    // Update main progress bar
    document.getElementById('progress-percent').textContent = `${percent}%`;
    const pbar = document.getElementById('main-progress-bar');
    pbar.style.width = `${percent}%`;
    pbar.textContent = `${percent}%`;

    // Render Breakdown list
    const breakdownEl = document.getElementById('breakdown-list');
    breakdownEl.innerHTML = '';
    Object.keys(byType).forEach(key => {
        const item = byType[key];
        const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
        const div = document.createElement('div');
        div.style.marginBottom = '14px';
        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600;margin-bottom:4px;">
                <span>${item.label}</span>
                <span>${item.completed} / ${item.total} (${pct}%)</span>
            </div>
            <div class="progress-bar-container" style="height:14px;">
                <div class="progress-bar ${key === 'global' ? 'blue' : (key === 'group' ? 'purple' : 'green')}" style="width:${pct}%;font-size:0.65rem;"></div>
            </div>
        `;
        breakdownEl.appendChild(div);
    });

    // Render Doughnut Chart (Status)
    renderStatusChart(completed, pending - overdue, overdue);

    // Render Bar Chart (By Type)
    renderTypesChart(byType);
}

function renderStatusChart(completed, upcoming, overdue) {
    const ctx = document.getElementById('chart-status');
    if (chartStatus) chartStatus.destroy();

    chartStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Completades', 'Pendents', 'Vencudes'],
            datasets: [{
                data: [completed, upcoming, overdue],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
        }
    });
}

function renderTypesChart(byType) {
    const ctx = document.getElementById('chart-types');
    if (chartTypes) chartTypes.destroy();

    const labels = Object.values(byType).map(v => v.label);
    const totalData = Object.values(byType).map(v => v.total);
    const completedData = Object.values(byType).map(v => v.completed);

    chartTypes = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Completades',
                    data: completedData,
                    backgroundColor: '#10b981',
                    borderRadius: 6
                },
                {
                    label: 'Totals',
                    data: totalData,
                    backgroundColor: '#e2e8f0',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
        }
    });
}

