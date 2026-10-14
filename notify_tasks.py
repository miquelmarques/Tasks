import os
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client, Client

# --- CONFIGURACIÓN DESDE VARIABLES DE ENTORNO ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_SERVER = os.environ.get("SMTP_SERVER")
SMTP_PORT = os.environ.get("SMTP_PORT", "587")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def send_email(to_email, task_name, days_left):
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
    today = datetime.utcnow().date()
    target_dates = [
        (today + timedelta(days=7), 7),
        (today + timedelta(days=1), 1)
    ]

    print(f"Fecha actual (UTC): {today}")

    for target_date, days_diff in target_dates:
        # Definimos el rango del día: desde las 00:00:00 hasta las 23:59:59
        start_of_day = datetime.combine(target_date, datetime.min.time()).isoformat() + "Z"
        end_of_day = datetime.combine(target_date, datetime.max.time()).isoformat() + "Z"
        
        print(f"Buscando tareas entre {start_of_day} y {end_of_day}...")

        # FILTRO CORREGIDO: Usamos .gte (Mayor o igual) y .lte (Menor o igual)
        tasks_response = supabase.table("tasks") \
            .select("id, name, due_date, user_id") \
            .gte("due_date", start_of_day) \
            .lte("due_date", end_of_day) \
            .execute()

        tasks = tasks_response.data

        if not tasks:
            print(f"No hay tareas para el {target_date}.")
            continue

        for task in tasks:
            task_id = task['id']
            progress_response = supabase.table("user_tasks") \
                .select("completed, user_id") \
                .eq("task_id", task_id) \
                .execute()
            
            user_progress = progress_response.data[0] if progress_response.data else None

            if not user_progress or not user_progress.get('completed'):
                uid = task.get('user_id') or (user_progress.get('user_id') if user_progress else None)
                if uid:
                    try:
                        user_auth = supabase.auth.admin.get_user_by_id(uid)
                        email = user_auth.user.email
                        if email:
                            send_email(email, task['name'], days_diff)
                    except Exception as e:
                        print(f"❌ Error obteniendo usuario {uid}: {e}")

if __name__ == "__main__":
    if not all([SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASSWORD]):
        print("❌ Error: Faltan variables de entorno necesarias.")
    else:
        check_and_notify()
