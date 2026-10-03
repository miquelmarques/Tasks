import requests
import json
import sys

# --- CONFIGURACIÓ ---
GITHUB_TOKEN = 'EL_TEU_TOKEN_AQUÍ'
REPO_OWNER = 'TU_USUARI_GITHUB'
REPO_NAME = 'NOM_DEL_REPOSITORI'
FILE_PATH = 'tasks.json'
# --------------------

def add_new_task(task_text):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{FILE_PATH}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"}

    # 1. Obtenir el fitxer actual
    res = requests.get(url, headers=headers)
    if res.status_code != 200:
        print("Error obrint el fitxer")
        return

    file_data = res.json()
    sha = file_data['sha']
    content = json.loads(requests.utils.base64_decode(file_data['content']).decode('utf-8'))

    # 2. Afegir la nova tasca
    content.append(task_text)

    # 3. Pujar el fitxer actualitzat
    import base64
    encoded_content = base64.b64encode(json.dumps(content, indent=4).encode('utf-8')).decode('utf-8')
    
    payload = {
        "message": f"Afegint nova tasca: {task_text}",
        "content": encoded_content,
        "sha": sha
    }
    
    put_res = requests.put(url, headers=headers, json=payload)
    if put_res.status_code == 200:
        print(f"✅ Tasca '{task_text}' afegida amb èxit!")
    else:
        print(f"❌ Error: {put_res.text}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Ús: python3 add_task.py 'Text de la tasca'")
    else:
        add_new_task(sys.argv[1])
