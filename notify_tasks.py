import os
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
SMTP_USER = os.environ["SMTP_USER"]
SMTP_PASSWORD = os.environ["SMTP_PASSWORD"]
SMTP_SERVER = os.environ["SMTP_SERVER"]
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))

ALERT_DAYS = {7, 3, 1, 0, -1}   # días en los que se avisa
_email_cache = {}

def get_email(uid):
    if uid not in _email_cache:
        try:
            _email_cache[uid] = supabase.auth.admin.get_user_by_id(uid).user.email
        except Exception as e:
            print(f"❌ No se pudo obtener el email de {uid}: {e}")
            _email_cache[uid] = None
    return _email_cache[uid]

def build_message(to_email, task_name, days_left):
    if days_left < 0:
        subject = f"🚨 TAREA VENCIDA: {task_name}"
        body = f"La tarea '{task_name}' venció hace {abs(days_left)} día(s)."
    elif days_left == 0:
        subject = f"⚠️ VENCE HOY: {task_name}"
        body = f"La tarea '{task_name}' vence hoy."
    else:
        subject = f"📅 Recordatorio: {task_name}"
        body = f"La tarea '{task_name}' vence en {days_left} día(s)."
    msg = MIMEText(f"Hola,\n\n{body}", "plain", "utf-8")
    msg["From"], msg["To"], msg["Subject"] = SMTP_USER, to_email, subject
    return msg

def get_recipients(task):
    progress = supabase.table("user_tasks").select("user_id, completed") \
        .eq("task_id", task["id"]).execute().data
    completed = {p["user_id"] for p in progress if p.get("completed")}
    pending = {p["user_id"] for p in progress if not p.get("completed")}

    if task.get("user_id"):                       # tarea con dueño
        recipients = ({task["user_id"]} | pending) - completed
    else:                                         # tarea global
        all_users = supabase.auth.admin.list_users()
        all_ids = {u.id for u in all_users.users}  # ojo: paginado
        recipients = all_ids - completed
    return recipients

def check_and_notify():
    today = datetime.now(timezone.utc).date()
    tasks = supabase.table("tasks").select("id, name, due_date, user_id").execute().data

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:   # una sola conexión
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)

        for task in tasks or []:
            if not task.get("due_date"):
                continue
            days = (datetime.strptime(task["due_date"][:10], "%Y-%m-%d").date() - today).days
            if days not in ALERT_DAYS:
                continue
            for uid in get_recipients(task):
                email = get_email(uid)
                if email:
                    server.send_message(build_message(email, task["name"], days))
                    print(f"✅ {email}: {task['name']} ({days} días)")

if __name__ == "__main__":
    check_and_notify()