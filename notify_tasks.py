"""
notify_tasks.py — Envia a cada usuari UN correu amb les tasques pendents
que li vencen en els pròxims N dies (per defecte 3).

Variables d'entorn:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (obligatòries)
  SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD  (obligatòries si no és DRY_RUN)
  ALERT_WINDOW_DAYS  dies d'antelació (defecte 3)
  INCLUDE_OVERDUE    "1" per incloure també les vençudes (defecte 0)
  SITE_URL           enllaç al dashboard
  TIMEZONE           defecte Europe/Madrid
  DRY_RUN            "1" per mostrar els correus sense enviar-los
"""
import os
import smtplib
from collections import defaultdict
from datetime import datetime, date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from zoneinfo import ZoneInfo

WINDOW = int(os.environ.get("ALERT_WINDOW_DAYS", "3"))
INCLUDE_OVERDUE = os.environ.get("INCLUDE_OVERDUE", "0") == "1"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
SITE_URL = os.environ.get("SITE_URL", "https://miquelmarques.github.io/Tasks/")
TZ = ZoneInfo(os.environ.get("TIMEZONE", "Europe/Madrid"))


# ── Dades ───────────────────────────────────────────────
def fetch_all(sb, table, columns):
    """Llegeix totes les files paginant (PostgREST retorna màx. 1000)."""
    rows, start, step = [], 0, 1000
    while True:
        batch = sb.table(table).select(columns).range(start, start + step - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < step:
            return rows
        start += step


def fetch_users(sb):
    """{user_id: email} de tots els usuaris amb el correu confirmat."""
    users, page = {}, 1
    while True:
        batch = sb.auth.admin.list_users(page=page, per_page=1000)
        for u in batch:
            if u.email and u.email_confirmed_at:
                users[u.id] = u.email
        if len(batch) < 1000:
            return users
        page += 1


def build_digest(tasks, progress, members, users, groups, today):
    """Retorna {user_id: [(days_left, task, group_name), ...]} ordenat per data."""
    completed = {(p["user_id"], p["task_id"]) for p in progress if p.get("completed")}
    group_members = defaultdict(set)
    for m in members:
        group_members[m["group_id"]].add(m["user_id"])
    group_names = {g["id"]: g["name"] for g in groups}

    digest = defaultdict(list)
    for task in tasks:
        if not task.get("due_date"):
            continue
        due = date.fromisoformat(str(task["due_date"])[:10])
        days = (due - today).days
        if days > WINDOW or (days < 0 and not INCLUDE_OVERDUE):
            continue

        ttype = task.get("task_type") or "global"
        if ttype == "personal":
            recipients = {task["user_id"]} if task.get("user_id") else set()
        elif ttype == "group":
            recipients = group_members.get(task.get("group_id"), set())
        else:
            recipients = set(users)

        for uid in recipients:
            if uid in users and (uid, task["id"]) not in completed:
                digest[uid].append((days, task, group_names.get(task.get("group_id"))))

    for items in digest.values():
        items.sort(key=lambda x: (x[0], x[1]["name"]))
    return digest


# ── Correu ──────────────────────────────────────────────
def when_text(days):
    if days < 0:
        return f"🔴 Vençuda fa {-days} dia{'s' if days < -1 else ''}"
    if days == 0:
        return "⚠️ Venç AVUI"
    if days == 1:
        return "⚠️ Venç demà"
    return f"📅 Venç en {days} dies"


def build_message(sender, to_email, items):
    n = len(items)
    subject = (f"📋 Tens {n} tasques pendents aquests dies" if n > 1
               else "📋 Tens 1 tasca pendent aquests dies")
    type_lbl = {"global": "🌍 Global", "group": "👥 Grupal", "personal": "👤 Personal"}

    text_lines, html_rows = [], []
    for days, task, gname in items:
        due = date.fromisoformat(str(task["due_date"])[:10]).strftime("%d/%m/%Y")
        kind = type_lbl.get(task.get("task_type") or "global", "")
        extra = f" · {gname}" if gname else ""
        text_lines.append(f"- {task['name']} — {when_text(days)} ({due}) [{kind}{extra}]")
        link = (f' <a href="{escape(task["link_url"])}">🔗</a>' if task.get("link_url") else "")
        color = "#dc2626" if days <= 0 else ("#d97706" if days == 1 else "#334155")
        html_rows.append(
            f'<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;">'
            f'<b>{escape(task["name"])}</b>{link}<br>'
            f'<span style="font-size:12px;color:#64748b;">{kind}{escape(extra)}</span></td>'
            f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;color:{color};white-space:nowrap;">'
            f'{when_text(days)}<br><span style="font-size:12px;">{due}</span></td></tr>'
        )

    text = (f"Hola,\n\nAquestes tasques et vencen en els pròxims {WINDOW} dies i encara "
            f"no les has marcat com a completades:\n\n" + "\n".join(text_lines) +
            f"\n\nObre el dashboard: {SITE_URL}\n")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
<h2 style="margin-bottom:4px;">📋 Tasques pendents</h2>
<p>Aquestes tasques et vencen en els pròxims {WINDOW} dies i encara no les has marcat com a completades:</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;">{''.join(html_rows)}</table>
<p style="margin-top:20px;"><a href="{escape(SITE_URL)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Obrir el dashboard</a></p>
<p style="font-size:11px;color:#94a3b8;">Rebràs aquest avís cada dia mentre tinguis tasques pendents a prop del venciment.</p>
</div>"""

    msg = MIMEMultipart("alternative")
    msg["From"], msg["To"], msg["Subject"] = sender, to_email, subject
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg


# ── Main ────────────────────────────────────────────────
def main():
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    today = datetime.now(TZ).date()

    tasks = fetch_all(sb, "tasks", "id, name, due_date, link_url, user_id, task_type, group_id")
    progress = fetch_all(sb, "user_tasks", "user_id, task_id, completed")
    members = fetch_all(sb, "task_group_members", "group_id, user_id")
    groups = fetch_all(sb, "task_groups", "id, name")
    users = fetch_users(sb)

    digest = build_digest(tasks, progress, members, users, groups, today)
    print(f"📅 {today} — finestra {WINDOW} dies — {len(digest)} usuari(s) a avisar")
    if not digest:
        return

    sender = os.environ.get("SMTP_USER", "dry-run@example.com")
    if DRY_RUN:
        for uid, items in digest.items():
            print(f"\n✉️  {users[uid]} ({len(items)} tasques)")
            for days, task, _ in items:
                print(f"   - {task['name']}: {when_text(days)}")
        return

    errors = 0
    with smtplib.SMTP(os.environ["SMTP_SERVER"], int(os.environ.get("SMTP_PORT") or 587)) as server:
        server.starttls()
        server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        for uid, items in digest.items():
            try:
                server.send_message(build_message(sender, users[uid], items))
                print(f"✅ {users[uid]}: {len(items)} tasca/ques")
            except Exception as e:
                errors += 1
                print(f"❌ {users[uid]}: {e}")
    if errors:
        raise SystemExit(f"{errors} correu(s) no s'han pogut enviar")


if __name__ == "__main__":
    main()
