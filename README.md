# 🎓 Dashboard de Seguiment de Tasques - ASIX2A

Aquesta aplicació és una eina integral de gestió de tasques dissenyada específicament per al grup de classe de **ASIX2A**, amb l'objectiu de facilitar l'organització, el seguiment i l'anàlisi dels entregables i activitats del curs.

## 🚀 Funcionalitats Principals

L'aplicació permet gestionar el progrés acadèmic mitjançant tres modalitats de tasques:

### 🌍 1. Tasques Globals
* **Per a tothom:** L'administrador crea tasques que apareixen per a tots els alumnes del grup de classe.
* **Seguiment Individual:** Cada alumne pot marcar com a "completada" la tasca per al seu propi perfil.
* **Control de venciment:** Avisos visuals clars per data (🔴 Vencuda, ⚠️ Urgent, 📅 Pròxima).

### 👥 2. Tasques Grupals
* **Grups de Treball:** L'administrador crea grups (ex: *Projecte M04*, *Pràctica Final*) i afegeix alumnes.
* **Administrador de Tasca/Grup:** Dins de cada grup es pot assignar un o diversos membres com a administradors del grup.
* **Privadesa Grupal:** Només els membres del grup veuen i poden completar les tasques del seu grup.

### 👤 3. Tasques Personals
* **Autonomia:** Cada usuari pot crear les seves pròpies tasques privades.
* **Etiquetes i Filtres:** Crea etiquetes personalitzades (amb colors) i assigna-les a les teves tasques per filtrar ràpidament.
* **Personalització:** Afegeix enllaços propis i colors per categoritzar-les.

---

## 📅 Visió per Dies (Sense Hora)
Totes les tasques es gestionen exclusivament a nivell de **data (dia/mes/any)**, eliminant la confusió d'hores específiques. Tant al tauler principal com al calendari es mostren per dies complets.

---

## 📊 Índex Estadístic (`stats.html`)
Pàgina de mètriques i analítica per fer seguiment del progrés:
* **KPIs Clau:** Total de tasques, completades, pendents i vençudes.
* **Barra de Progrés Global:** Percentatge general de feina completada.
* **Gràfic d'Estat:** Distribució visual en gràfic de donut (Completades / Pendents / Vençudes).
* **Desglossament per Modalitat:** Mètriques separades per a tasques Globals, Grupals i Personals.

---

## 🛠️ Tecnologies Utilitzades

* **Frontend:** HTML5, CSS3 modern (variables, grid, flexbox, animacions), JavaScript ES6+.
* **Llibreries:**
  * [Supabase JS Client v2](https://supabase.com)
  * [FullCalendar](https://fullcalendar.io/) (vista de calendari)
  * [Chart.js](https://www.chartjs.org/) (gràfics estadístics)
* **Backend:** **Supabase** (PostgreSQL, Row Level Security, Auth).
* **Notificacions:** Script en Python (`notify_tasks.py`) per avisar per correu automàticament abans del venciment.

---

## 🗄️ Configuració de la Base de Dades

Per aplicar les noves taules i funcionalitats a PostgreSQL (Supabase):

1. Obre el teu panell de **Supabase** -> **SQL Editor**.
2. Copia i enganxa el contingut del fitxer [`schema.sql`](file:///home/miquelmarques/Tasks/schema.sql).
3. Executa la consulta (`Run`). Això crearà:
   * Les noves taules `task_groups`, `task_group_members`, `task_labels`, `task_label_assignments`.
   * Les columnes `task_type` i `group_id` a la taula `tasks`.
   * El canvi de tipus de data a `DATE` (només dia).
   * Totes les polítiques de seguretat RLS (Row Level Security).
