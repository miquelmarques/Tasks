-- ============================================================
-- SCHEMA COMPLET — Dashboard de Tasques ASIX2A
-- PostgreSQL (Supabase)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TAULA DE PERFILS  (ja existeix, afegim camps si calen)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT,
    display_name TEXT,
    is_admin    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Trigger per crear perfil automàticament en registrar-se
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 2. GRUPS DE TASQUES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_group_members (
    id          SERIAL PRIMARY KEY,
    group_id    INT NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_admin    BOOLEAN DEFAULT FALSE,
    joined_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 3. TASQUES  (afegir camps nous: task_type, group_id)
-- ────────────────────────────────────────────────────────────
-- Si la taula ja existeix, afegim les columnes noves.
-- En cas de primera instal·lació, crear-la sencera.

CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    due_date    DATE,                          -- ← CANVI: era TIMESTAMPTZ, ara només DATE
    link_url    TEXT,
    color       TEXT,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    task_type   TEXT NOT NULL DEFAULT 'global'  -- 'global' | 'group' | 'personal'
                CHECK (task_type IN ('global','group','personal')),
    group_id    INT REFERENCES task_groups(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Si la taula ja existeix i falten columnes:
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='task_type') THEN
        ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'global' CHECK (task_type IN ('global','group','personal'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='group_id') THEN
        ALTER TABLE tasks ADD COLUMN group_id INT REFERENCES task_groups(id) ON DELETE CASCADE;
    END IF;
    -- Canviar due_date de TIMESTAMPTZ a DATE si cal
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tasks' AND column_name='due_date' AND data_type != 'date'
    ) THEN
        ALTER TABLE tasks ALTER COLUMN due_date TYPE DATE USING due_date::DATE;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. PROGRÉS D'USUARI PER TASCA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tasks (
    id               SERIAL PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id          INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed        BOOLEAN DEFAULT FALSE,
    color            TEXT,
    personal_link_url TEXT,
    document_url     TEXT,
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, task_id)
);

-- ────────────────────────────────────────────────────────────
-- 5. ETIQUETES PERSONALS (per filtrar)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_labels (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT DEFAULT '#6366f1',
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS task_label_assignments (
    id          SERIAL PRIMARY KEY,
    label_id    INT NOT NULL REFERENCES task_labels(id) ON DELETE CASCADE,
    task_id     INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    UNIQUE(label_id, task_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 6. FUNCIONS D'AJUDA (SECURITY DEFINER per evitar recursió RLS)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_if_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id INT, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.task_group_members
        WHERE group_id = p_group_id AND user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id INT, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.task_group_members
        WHERE group_id = p_group_id AND user_id = p_user_id AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (public.check_if_admin());

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View tasks" ON tasks;
CREATE POLICY "View tasks" ON tasks FOR SELECT USING (
    task_type = 'global'
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND public.is_group_member(group_id, auth.uid()))
);
DROP POLICY IF EXISTS "Admin insert global tasks" ON tasks;
CREATE POLICY "Admin insert global tasks" ON tasks FOR INSERT WITH CHECK (
    (task_type = 'global' AND public.check_if_admin())
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);
DROP POLICY IF EXISTS "Update tasks" ON tasks;
CREATE POLICY "Update tasks" ON tasks FOR UPDATE USING (
    public.check_if_admin()
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);
DROP POLICY IF EXISTS "Delete tasks" ON tasks;
CREATE POLICY "Delete tasks" ON tasks FOR DELETE USING (
    public.check_if_admin()
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);

-- user_tasks
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own progress" ON user_tasks;
CREATE POLICY "Users manage own progress" ON user_tasks FOR ALL USING (user_id = auth.uid());

-- task_groups
ALTER TABLE task_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View groups user belongs to" ON task_groups;
CREATE POLICY "View groups user belongs to" ON task_groups FOR SELECT USING (
    public.is_group_member(id, auth.uid())
    OR public.check_if_admin()
);
DROP POLICY IF EXISTS "Admin create groups" ON task_groups;
CREATE POLICY "Admin create groups" ON task_groups FOR INSERT WITH CHECK (
    public.check_if_admin()
);
DROP POLICY IF EXISTS "Admin update groups" ON task_groups;
CREATE POLICY "Admin update groups" ON task_groups FOR UPDATE USING (
    public.check_if_admin()
    OR created_by = auth.uid()
);
DROP POLICY IF EXISTS "Admin delete groups" ON task_groups;
CREATE POLICY "Admin delete groups" ON task_groups FOR DELETE USING (
    public.check_if_admin()
);

-- task_group_members
ALTER TABLE task_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View group members" ON task_group_members;
CREATE POLICY "View group members" ON task_group_members FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id, auth.uid())
    OR public.check_if_admin()
);
DROP POLICY IF EXISTS "Manage group members" ON task_group_members;
CREATE POLICY "Manage group members" ON task_group_members FOR INSERT WITH CHECK (
    public.is_group_admin(group_id, auth.uid())
    OR public.check_if_admin()
);
DROP POLICY IF EXISTS "Update group members" ON task_group_members;
CREATE POLICY "Update group members" ON task_group_members FOR UPDATE USING (
    public.is_group_admin(group_id, auth.uid())
    OR public.check_if_admin()
);
DROP POLICY IF EXISTS "Remove group members" ON task_group_members;
CREATE POLICY "Remove group members" ON task_group_members FOR DELETE USING (
    public.is_group_admin(group_id, auth.uid())
    OR public.check_if_admin()
);

-- task_labels
ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own labels" ON task_labels;
CREATE POLICY "Users manage own labels" ON task_labels FOR ALL USING (user_id = auth.uid());

-- task_label_assignments
ALTER TABLE task_label_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own label assignments" ON task_label_assignments;
CREATE POLICY "Users manage own label assignments" ON task_label_assignments FOR ALL USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 8. ÍNDEXS PER RENDIMENT
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_task ON user_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON task_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON task_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_labels_user ON task_labels(user_id);

