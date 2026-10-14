import os
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client, Client

# --- CONFIGURACIÓN DESDE VARIABLES DE ENTORNO (GITHUB SECRETS) ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_SERVER = os.environ.get("SMTP_SERVER")
SMTP_PORT = os.environ.get("SMTP_PORT", "587")

# Inicializar cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def send_email(to_email, task_name, days_left):
    """Envía un correo electrónico de notificación."""
    subject = f"⚠️ Recordatorio de Tarea: {task_name}"
    
    if days_left == 7:
        body = f"Hola,\n\nTe recordamos que la tarea '{task_name}' vence en una semana (7 días).\n\n¡Mantente al día!"
    elif days_left == 1:
        body = f"Hola,\n\n¡Atención! La tarea '{task_name}' vence MAÑANA.\n\nPor favor, asegúrate de completarla a tiempo."
    else:
        body = f"Hola,\n\nRecordatorio de la tarea '{task_name}' que vence en {days_left} días."

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
        print(f"✅ Email enviado a {to_email} ({days_left} días para: {task_name})")
    except Exception as e:
        print(f"❌ Error enviando email a {to_email}: {e}")

def check_and_notify():
    """Revisa tareas pendientes y envía alertas."""
    # Usamos UTC para consistencia con la base de datos
    today = datetime.utcnow().date()
    
    # Definimos las fechas objetivo (7 días y 1 día)
    target_dates = [
        (today + timedelta(days=7), 7),
        (today + timedelta(days=1), 1)
    ]

    print(f"Fecha actual (UTC): {today}")

    for target_date, days_diff in target_dates:
        date_str = target_date.isoformat()
        print(f"Buscando tareas que vencen el {date_str}...")

        # 1. Buscar tareas que vencen en esa fecha exacta
        # Nota: Filtramos por el inicio del día (due_date comienza por la fecha)
        tasks_response = supabase.table("tasks") \
            .select("id, name, due_date, user_id") \
            .ilike("due_date", f"{date_str}%") \
            .execute()

        tasks = tasks_response.data

        if not tasks:
            print(f"No hay tareas para el {date_str}.")
            continue

        for task in tasks:
            task_id = task['id']
            
            # 2. Verificar si el usuario ya completó la tarea en 'user_tasks'
            progress_response = supabase.table("user_tasks") \
                .select("completed, user_id") \
                .eq("task_id", task_id) \
                .execute()
            
            user_progress = progress_response.data[0] if progress_response.data else None

            # Si no hay registro de progreso o no está completada, enviamos alerta
            if not user_progress or not user_progress.get('completed'):
                # 3. Obtener el email del usuario desde Auth (requiere Service Role Key)
                # Prioridad: user_id de la tarea -> user_id del progreso
                uid = task.get('user_id') or (user_progress.get('user_id') if user_progress else None)
                
                if uid:
                    try:
                        user_auth = supabase.auth.admin.get_user_by_id(uid)
                        email = user_auth.user.email
                        if email:
                            send_email(email, task['name'], days_diff)
                    except Exception as e:
                        print(f"❌ Error obteniendo usuario {uid}: {e}")
                else:
                    print(f"⚠️ No se encontró user_id para la tarea {task['name']}")

if __name__ == "__main__":
    if not all([SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASSWORD]):
        print("❌ Error: Faltan variables de entorno necesarias.")
    else:
        check_and_notify()
