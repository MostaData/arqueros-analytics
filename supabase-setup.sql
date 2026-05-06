-- ═══════════════════════════════════════════════════════════════════════
-- ARQUEROS ANALYTICS — Supabase Setup
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Tabla de control de acceso por arquero
CREATE TABLE IF NOT EXISTS public.user_archer_access (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  archer_id    TEXT NOT NULL,
  archer_name  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, archer_id)
);

-- 4. Función helper para verificar si el usuario actual es admin
--    (SECURITY DEFINER evita recursión en RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- 5. Función para eliminar usuario (incluyendo auth.users)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;

-- 6. Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_archer_access ENABLE ROW LEVEL SECURITY;

-- Policies: profiles
DROP POLICY IF EXISTS "profiles_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (public.is_admin());
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (public.is_admin());
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (true);

-- Policies: user_archer_access
DROP POLICY IF EXISTS "access_read"   ON public.user_archer_access;
DROP POLICY IF EXISTS "access_insert" ON public.user_archer_access;
DROP POLICY IF EXISTS "access_delete" ON public.user_archer_access;

CREATE POLICY "access_read"   ON public.user_archer_access FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "access_insert" ON public.user_archer_access FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "access_delete" ON public.user_archer_access FOR DELETE USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- PASO FINAL: Promover tu cuenta a ADMIN
-- 1. Crear cuenta en: https://mostadata.github.io/arqueros-analytics/login.html
-- 2. Reemplazar el email y ejecutar:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
-- ═══════════════════════════════════════════════════════════════════════
