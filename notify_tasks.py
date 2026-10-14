import os
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_SERVER = os.environ.get("SMTP_SERVER")
SMTP_PORT = os.environ.get("SMTP_PORT", "587")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def send_email(to_email, task_name, days_left):
    subject = f"⚠️ Recordatorio de Tarea: {task_name}"
    body = f"Hola,\n\nTe recordamos que la tarea '{task_name}' vence en {days_left} días.\n\n¡No lo olvides!"
    
    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP(SMTP_SERVER, int(SMTP_PORT))
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"✅ Email enviado a {to_email} ({days_left} días: {task_name})")
    except Exception as e:
        print(f"❌ Error enviando email a {to_email}: {e}")

def check_and_notify():
    today = datetime.utcnow().date()
    print(f"--- INICIO DE PROCESO - Fecha actual: {today} ---")

    # 1. DIAGNÓSTICO: Listar todas las tareas para ver qué hay en la DB
    print("🔍 Analizando todas las tareas en la base de datos...")
    all_tasks = supabase.table("tasks").select("id, name, due_date, user_id").execute().data
    
    if not all_tasks:
        print("❌ No se encontró NINGUNA tarea en la tabla 'tasks'.")
        return

    for task in all_tasks:
        if not task.get('due_date'):
            continue
            
        # Calculamos la diferencia de días real
        task_date = datetime.strptime(task['due_date'][:10], "%Y-%m-%d").date()
        days_diff = (task_date - today).days
        
        # Solo nos interesan las que vencen en 1 o 7 días
        if days_diff in [1, 7]:
            print(f"🎯 Tarea encontrada: {task['name']} (Vence en {days_diff} días)")
            
            # 2. BUSCAR USUARIOS A NOTIFICAR
            users_to_notify = []
            
            # Caso A: La tarea tiene un dueño específico
            if task.get('user_id'):
                users_to_notify.append(task['user_id'])
            
            # Caso B: Buscar en user_tasks quién tiene esta tarea asignada (especialmente si es global)
            progress_data = supabase.table("user_tasks") \
                .select("user_id, completed") \
                .eq("task_id", task['id']) \
                .execute().data
            
            for p in progress_data:
                if not p.get('completed'):
                    if p.get('user_id') not in users_to_notify:
                        users_to_notify.append(p['user_id'])

            # 3. ENVIAR EMAILS
            if not users_to_notify:
                print(f"⚠️ No se encontraron usuarios asociados a la tarea {task['name']}")
            
            for uid in users_to_notify:
                try:
                    user_auth = supabase.auth.admin.get_user_by_id(uid)
                    email = user_auth.user.email
                    if email:
                        send_email(email, task['name'], days_diff)
                    else:
                        print(f"❌ Usuario {uid} no tiene email configurado.")
                except Exception as e:
                    print(f"❌ Error obteniendo email del usuario {uid}: {e}")
        else:
            # Esto nos ayuda a depurar en el log de GitHub
            print(f"ℹ️ Ignorando: {task['name']} (Vence en {days_diff} días)")

if __name__ == "__main__":
    check_and_notify()
