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

ALERT_DAYS = {7, 3, 1, 0, -1}   # Dies en què s'avisa
_email_cache = {}

def get_email(uid):
    if uid not in _email_cache:
        try:
            _email_cache[uid] = supabase.auth.admin.get_user_by_id(uid).user.email
        except Exception as e:
            print(f"❌ No s'ha pogut obtenir el correu de {uid}: {e}")
            _email_cache[uid] = None
    return _email_cache[uid]

def build_message(to_email, task_name, days_left):
    if days_left < 0:
        subject = f"🚨 TASCA VENCUDA: {task_name}"
        body = f"La tasca '{task_name}' va vèncer fa {abs(days_left)} dia/es."
    elif days_left == 0:
        subject = f"⚠️ VENC AVUI: {task_name}"
        body = f"La tasca '{task_name}' venç avui."
    else:
        subject = f"📅 Recordatori: {task_name}"
        body = f"La tasca '{task_name}' venç en {days_left} dia/es."
    msg = MIMEText(f"Hola,\n\n{body}", "plain", "utf-8")
    msg["From"], msg["To"], msg["Subject"] = SMTP_USER, to_email, subject
    return msg

def get_recipients(task):
    progress = supabase.table("user_tasks").select("user_id, completed") \
        .eq("task_id", task["id"]).execute().data
    completed = {p["user_id"] for p in progress if p.get("completed")}

    task_type = task.get("task_type", "global")

    if task_type == "personal":
        # Només el propietari
        recipients = {task["user_id"]} - completed if task.get("user_id") else set()
    elif task_type == "group":
        # Membres del grup
        group_id = task.get("group_id")
        if group_id:
            members = supabase.table("task_group_members").select("user_id") \
                .eq("group_id", group_id).execute().data
            recipients = {m["user_id"] for m in members} - completed
        else:
            recipients = set()
    else:
        # Global: tots els usuaris
        all_users = supabase.auth.admin.list_users()
        all_ids = {u.id for u in all_users.users}
        recipients = all_ids - completed

    return recipients

def check_and_notify():
    today = datetime.now(timezone.utc).date()
    tasks = supabase.table("tasks").select("id, name, due_date, user_id, task_type, group_id").execute().data

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)

        for task in tasks or []:
            if not task.get("due_date"):
                continue
            # due_date és YYYY-MM-DD
            task_date = datetime.strptime(str(task["due_date"])[:10], "%Y-%m-%d").date()
            days = (task_date - today).days

            if days not in ALERT_DAYS:
                continue

            for uid in get_recipients(task):
                email = get_email(uid)
                if email:
                    server.send_message(build_message(email, task["name"], days))
                    print(f"✅ {email}: {task['name']} ({days} dies)")

if __name__ == "__main__":
    check_and_notify()
