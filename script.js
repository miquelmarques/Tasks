const GITHUB_CONFIG = {
    owner: 'TU_USUARI_GITHUB',
    repo: 'NOM_DEL_REPOSITORI',
    tasksPath: 'tasks.json',
    dataPath: 'data.json'
};

let currentTasks = [];
let currentProgress = {};
let dataSha = "";

const usernameInput = document.getElementById('username');
const tokenInput = document.getElementById('token');
const loadBtn = document.getElementById('load-btn');
const tasksContainer = document.getElementById('tasks-container');

loadBtn.addEventListener('click', initApp);

async function initApp() {
    const user = usernameInput.value.trim();
    const token = tokenInput.value.trim();

    if (!user || !token) {
        alert("Si us plau, introdueix el nom i el token.");
        return;
    }

    try {
        // 1. Carreguem la llista de tasques (pública)
        await loadTasks();
        
        // 2. Carreguem el progrés de l'usuari (privada/token)
        await loadProgress(token);

        renderTasks(user);
    } catch (error) {
        console.error(error);
        alert("Error iniciant l'aplicació. Revisa la configuració.");
    }
}

async function loadTasks() {
    const response = await fetch(`https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/main/${GITHUB_CONFIG.tasksPath}`);
    if (!response.ok) throw new Error("No s'ha trobat el fitxer tasks.json");
    currentTasks = await response.json();
}

async function loadProgress(token) {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`, {
        headers: { 'Authorization': `token ${token}` }
    });
    
    const fileData = await response.json();
    if (fileData.sha) {
        dataSha = fileData.sha;
        const content = decodeURIComponent(escape(atob(fileData.content)));
        currentProgress = JSON.parse(content);
    } else {
        currentProgress = {};
    }
}

function renderTasks(user) {
    tasksContainer.innerHTML = "";
    
    if (!currentProgress[user]) {
        currentProgress[user] = {};
    }

    currentTasks.forEach((taskText, index) => {
        const taskKey = `task${index}`;
        const isChecked = currentProgress[user][taskKey] || false;

        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''} data-task="${taskKey}">
            <span>${taskText}</span>
        `;

        div.querySelector('input').addEventListener('change', (e) => {
            updateTask(user, taskKey, e.target.checked);
        });

        tasksContainer.appendChild(div);
    });
}

async function updateTask(user, taskKey, status) {
    const token = tokenInput.value.trim();
    currentProgress[user][taskKey] = status;

    try {
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(currentProgress, null, 2))));
        
        const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Actualització de ${user}`,
                content: content,
                sha: dataSha
            })
        });

        if (response.ok) {
            const updatedFile = await response.json();
            dataSha = updatedFile.content.sha;
        } else {
            throw new Error("Error updating file");
        }
    } catch (error) {
        console.error(error);
        alert("Error guardant el progrés.");
    }
}
