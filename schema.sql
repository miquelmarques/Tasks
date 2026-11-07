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

-- Si la taula profiles ja existia sense aquestes columnes:
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='email') THEN
        ALTER TABLE profiles ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='display_name') THEN
        ALTER TABLE profiles ADD COLUMN display_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='username') THEN
        ALTER TABLE profiles ADD COLUMN username TEXT;
    END IF;
END $$;

-- Nom d'usuari: únic (sense distingir majúscules), 3-30 caràcters a-z 0-9 . _ -
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles (lower(username));
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format') THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
            CHECK (username IS NULL OR username ~ '^[a-z0-9._-]{3,30}$');
    END IF;
END $$;

-- Trigger per crear perfil automàticament en registrar-se
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_username TEXT := lower(trim(NEW.raw_user_meta_data->>'username'));
BEGIN
    IF v_username IS NULL OR v_username !~ '^[a-z0-9._-]{3,30}$'
       OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_username) THEN
        v_username := NULL;   -- mai fer fallar el registre per culpa del nom d'usuari
    END IF;
    INSERT INTO public.profiles (id, email, username, display_name)
    VALUES (NEW.id, NEW.email, v_username, NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    is_admin    BOOLEAN DEFAULT FALSE,
    joined_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- Assegurar foreign key cap a profiles si la taula ja existia
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_task_group_members_profiles'
    ) THEN
        ALTER TABLE task_group_members
        ADD CONSTRAINT fk_task_group_members_profiles
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

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

-- Si user_tasks ja existia sense personal_link_url o color:
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_tasks' AND column_name='personal_link_url') THEN
        ALTER TABLE user_tasks ADD COLUMN personal_link_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_tasks' AND column_name='color') THEN
        ALTER TABLE user_tasks ADD COLUMN color TEXT;
    END IF;
END $$;

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
DROP POLICY IF EXISTS "Authenticated users view profiles" ON profiles;
CREATE POLICY "Authenticated users view profiles" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Netejar totes les polítiques prèvies de la taula tasks per evitar regles permissives antigues
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'tasks' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks;', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "View tasks" ON tasks FOR SELECT USING (
    (task_type = 'global' AND group_id IS NULL)
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND public.is_group_member(group_id, auth.uid()))
);
CREATE POLICY "Admin insert global tasks" ON tasks FOR INSERT WITH CHECK (
    (task_type = 'global' AND public.check_if_admin())
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);
CREATE POLICY "Update tasks" ON tasks FOR UPDATE USING (
    public.check_if_admin()
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);
CREATE POLICY "Delete tasks" ON tasks FOR DELETE USING (
    public.check_if_admin()
    OR (task_type = 'personal' AND user_id = auth.uid())
    OR (task_type = 'group' AND (public.is_group_admin(group_id, auth.uid()) OR public.check_if_admin()))
);

-- Si s'havien creat tasques personals que van agafar el valor per defecte 'global':
UPDATE tasks
SET task_type = 'personal'
WHERE (task_type = 'global' OR task_type IS NULL)
  AND user_id IS NOT NULL
  AND group_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = tasks.user_id AND is_admin = TRUE);

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
    auth.uid() IS NOT NULL
);
DROP POLICY IF EXISTS "Admin update groups" ON task_groups;
CREATE POLICY "Admin update groups" ON task_groups FOR UPDATE USING (
    public.check_if_admin()
    OR created_by = auth.uid()
);
DROP POLICY IF EXISTS "Admin delete groups" ON task_groups;
CREATE POLICY "Admin delete groups" ON task_groups FOR DELETE USING (
    public.check_if_admin()
    OR created_by = auth.uid()
);

-- Permisos (GRANTs) necessaris per a usuaris autenticats
GRANT ALL ON TABLE public.task_groups TO authenticated;
GRANT ALL ON TABLE public.task_group_members TO authenticated;
GRANT ALL ON TABLE public.task_labels TO authenticated;
GRANT ALL ON TABLE public.task_label_assignments TO authenticated;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.user_tasks TO authenticated;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- SEGURETAT: un usuari NO pot canviar-se is_admin ell mateix.
-- Només es poden modificar aquestes columnes del propi perfil.
REVOKE UPDATE, INSERT, DELETE ON TABLE public.profiles FROM authenticated, anon;
GRANT UPDATE (display_name, username) ON TABLE public.profiles TO authenticated;

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


-- ────────────────────────────────────────────────────────────
-- 9. GESTIÓ D'USUARIS DES DE LA WEB (sense correu de verificació)
-- ────────────────────────────────────────────────────────────
-- Supabase no permet crear usuaris des del navegador amb la clau anon.
-- Aquesta funció (SECURITY DEFINER) crea l'usuari directament a auth.users
-- amb el correu JA CONFIRMAT, de manera que pot iniciar sessió immediatament.
-- Només la poden executar administradors globals o administradors de grup.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email        TEXT,
    p_password     TEXT,
    p_display_name TEXT DEFAULT NULL,
    p_group_id     INT  DEFAULT NULL,
    p_username     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID := gen_random_uuid();
    v_email   TEXT := lower(trim(p_email));
    v_username TEXT := NULLIF(lower(trim(p_username)), '');
BEGIN
    -- Permisos: admin global, o admin del grup indicat
    IF NOT (
        public.check_if_admin()
        OR (p_group_id IS NOT NULL AND public.is_group_admin(p_group_id, auth.uid()))
    ) THEN
        RAISE EXCEPTION 'No tens permisos per crear usuaris';
    END IF;

    IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Correu electrònic no vàlid';
    END IF;
    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'La contrasenya ha de tenir com a mínim 6 caràcters';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        RAISE EXCEPTION 'Ja existeix un usuari amb el correu %', v_email;
    END IF;
    IF v_username IS NOT NULL THEN
        IF v_username !~ '^[a-z0-9._-]{3,30}$' THEN
            RAISE EXCEPTION 'Nom d''usuari no vàlid (3-30 caràcters: a-z, 0-9, punt, guió, guió baix)';
        END IF;
        IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_username) THEN
            RAISE EXCEPTION 'El nom d''usuari % ja està agafat', v_username;
        END IF;
    END IF;

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        v_email, crypt(p_password, gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', p_display_name),
        now(), now(),
        '', '', '', '',
        '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
    );

    -- El trigger on_auth_user_created ja crea el perfil; afegim el nom
    INSERT INTO public.profiles (id, email, display_name, username)
    VALUES (v_user_id, v_email, NULLIF(trim(p_display_name), ''), v_username)
    ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name, username = EXCLUDED.username;

    IF p_group_id IS NOT NULL THEN
        INSERT INTO public.task_group_members (group_id, user_id, is_admin)
        VALUES (p_group_id, v_user_id, FALSE)
        ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;

    RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;

-- Confirmar manualment un usuari registrat que no ha pogut verificar el correu
CREATE OR REPLACE FUNCTION public.admin_confirm_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.check_if_admin() THEN
        RAISE EXCEPTION 'Només els administradors globals poden confirmar usuaris';
    END IF;
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_user(UUID) TO authenticated;

-- Retorna quins usuaris encara no tenen el correu confirmat (només admins globals)
CREATE OR REPLACE FUNCTION public.admin_unconfirmed_users()
RETURNS TABLE (id UUID, email TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.check_if_admin() THEN
        RETURN;
    END IF;
    RETURN QUERY
        SELECT u.id, u.email::TEXT, u.created_at
        FROM auth.users u
        WHERE u.email_confirmed_at IS NULL
        ORDER BY u.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unconfirmed_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unconfirmed_users() TO authenticated;

-- Crear perfils que falten (usuaris registrats abans que existís el trigger).
-- Sense perfil, l'usuari NO apareix al selector "Afegir Membre".
INSERT INTO public.profiles (id, email)
SELECT u.id, u.email FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Usuaris creats abans amb columnes de token a NULL no poden iniciar sessió
-- ("Database error querying schema"). Les posem a ''.
UPDATE auth.users SET
    confirmation_token         = COALESCE(confirmation_token, ''),
    recovery_token             = COALESCE(recovery_token, ''),
    email_change_token_new     = COALESCE(email_change_token_new, ''),
    email_change               = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change               = COALESCE(phone_change, ''),
    phone_change_token         = COALESCE(phone_change_token, ''),
    reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL
   OR email_change_token_new IS NULL OR email_change IS NULL
   OR email_change_token_current IS NULL OR phone_change IS NULL
   OR phone_change_token IS NULL OR reauthentication_token IS NULL;

-- ────────────────────────────────────────────────────────────
-- 10. INICI DE SESSIÓ AMB NOM D'USUARI
-- ────────────────────────────────────────────────────────────
-- Supabase només accepta correu + contrasenya. Aquesta funció tradueix
-- un nom d'usuari al seu correu abans de cridar signInWithPassword.
-- Nota: permet saber el correu d'un nom d'usuari conegut (acceptable per a
-- una app de classe; la contrasenya continua sent necessària).
CREATE OR REPLACE FUNCTION public.get_login_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT email FROM public.profiles
    WHERE lower(username) = lower(trim(p_identifier))
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_login_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_email(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(p_username)));
$$;
REVOKE ALL ON FUNCTION public.username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(TEXT) TO anon, authenticated;

-- Assignar un nom d'usuari per defecte (part del correu abans de @) als
-- usuaris que no en tenen. Si ja està agafat s'hi afegeix un número.
DO $$
DECLARE
    r RECORD;
    base TEXT;
    cand TEXT;
    n INT;
BEGIN
    FOR r IN SELECT id, email FROM public.profiles WHERE username IS NULL AND email IS NOT NULL LOOP
        base := left(regexp_replace(lower(split_part(r.email, '@', 1)), '[^a-z0-9._-]', '', 'g'), 26);
        IF length(base) < 3 THEN base := rpad(base, 3, '0'); END IF;
        cand := base; n := 1;
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = cand) LOOP
            n := n + 1; cand := base || n;
        END LOOP;
        UPDATE public.profiles SET username = cand WHERE id = r.id;
    END LOOP;
END $$;
