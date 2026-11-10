-- ====================================================================
-- CICR INVENTORY PORTAL - IDEMPOTENT ADMIN RBAC SECURITY MIGRATION
-- Safe to run on an existing live Supabase database via SQL Editor.
-- Locks self-signup to role='member', status='pending' and ensures only
-- existing DB-approved administrators can promote/demote other accounts.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  email_lower TEXT := lower(coalesce(NEW.email, ''));
  email_local TEXT := split_part(email_lower, '@', 1);
  raw_meta_name TEXT := coalesce(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    trim(concat_ws(' ', NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'family_name'))
  );
  extracted_roll TEXT;
  cleaned_meta_name TEXT;
  cleaned_email_name TEXT;
  final_name TEXT;
  resolved_role TEXT := 'member';
  resolved_status TEXT := 'pending';
  resolved_avatar TEXT;
BEGIN
  extracted_roll := coalesce(
    NULLIF(trim(NEW.raw_user_meta_data->>'roll_number'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'enrollment_no'), ''),
    (regexp_match(email_local, '([0-9]{6,})'))[1],
    (regexp_match(coalesce(raw_meta_name, ''), '(?:[jJ]|[''"])?([0-9]{6,})'))[1],
    CASE WHEN email_local ~ '^[0-9]{4,}$' THEN email_local ELSE '' END
  );

  cleaned_meta_name := trim(
    both ' ''"`-|/,' from
    regexp_replace(
      regexp_replace(coalesce(raw_meta_name, ''), '(?:[jJ]|[''"])?[0-9]{6,}|[()\[\]]', ' ', 'gi'),
      '\s+',
      ' ',
      'g'
    )
  );
  IF lower(cleaned_meta_name) IN ('member', 'new member', 'student', 'user', 'applicant') OR cleaned_meta_name ~ '^[0-9]+$' OR cleaned_meta_name !~ '[a-zA-Z]' THEN
    cleaned_meta_name := '';
  END IF;
  IF cleaned_meta_name <> '' AND (cleaned_meta_name = upper(cleaned_meta_name) OR cleaned_meta_name = lower(cleaned_meta_name)) THEN
    cleaned_meta_name := initcap(cleaned_meta_name);
  END IF;

  cleaned_email_name := trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(email_local, '\m[jJ][0-9]{6,}\M', ' ', 'gi'),
        '[0-9]{6,}|[._\-+]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
  cleaned_email_name := trim(regexp_replace(cleaned_email_name, '\m[0-9]+\M', '', 'g'));
  IF length(regexp_replace(cleaned_email_name, '[^a-zA-Z]', '', 'g')) < 2 THEN
    cleaned_email_name := '';
  ELSE
    cleaned_email_name := initcap(cleaned_email_name);
  END IF;

  IF cleaned_email_name <> '' AND cleaned_meta_name <> '' THEN
    IF array_length(regexp_split_to_array(cleaned_meta_name, '\s+'), 1) > array_length(regexp_split_to_array(cleaned_email_name, '\s+'), 1) THEN
      final_name := cleaned_meta_name;
    ELSE
      final_name := cleaned_email_name;
    END IF;
  ELSIF cleaned_email_name <> '' THEN
    final_name := cleaned_email_name;
  ELSIF cleaned_meta_name <> '' THEN
    final_name := cleaned_meta_name;
  ELSE
    final_name := 'Member';
  END IF;

  resolved_avatar := coalesce(
    NULLIF(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'picture'), ''),
    ''
  );

  INSERT INTO public.profiles (id, full_name, email, role, roll_number, status, avatar_url)
  VALUES (
    NEW.id,
    final_name,
    email_lower,
    resolved_role,
    coalesce(extracted_roll, ''),
    resolved_status,
    resolved_avatar
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.profiles.full_name IS NULL
        OR trim(public.profiles.full_name) = ''
        OR lower(public.profiles.full_name) IN ('member', 'new member')
        OR public.profiles.full_name ~ '^[jJ''"]?[0-9]{4,}$'
        OR public.profiles.full_name ~ '[0-9]{6,}'
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    email = EXCLUDED.email,
    roll_number = COALESCE(NULLIF(public.profiles.roll_number, ''), EXCLUDED.roll_number),
    avatar_url = COALESCE(NULLIF(public.profiles.avatar_url, ''), EXCLUDED.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND COALESCE(avatar_url, '') NOT IN ('status:pending', 'status:rejected')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
      AND COALESCE(avatar_url, '') NOT IN ('status:pending', 'status:rejected')
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role_and_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_approved_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only approved administrators can modify account role or status.';
    END IF;

    IF auth.uid() IS NOT NULL AND (NEW.id = auth.uid() OR OLD.id = auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: You cannot change your own role or approval status.';
    END IF;

    IF NEW.role = 'admin' AND COALESCE(NEW.status, OLD.status) <> 'approved' THEN
      RAISE EXCEPTION 'Only approved members can be promoted to administrator.';
    END IF;

    IF OLD.role = 'admin' AND OLD.status = 'approved' AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.status IS DISTINCT FROM 'approved') THEN
      SELECT COUNT(*) INTO remaining_admins
      FROM public.profiles
      WHERE role = 'admin'
        AND status = 'approved'
        AND id <> OLD.id;

      IF remaining_admins < 1 THEN
        RAISE EXCEPTION 'Cannot demote or suspend the last remaining administrator.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role_and_status ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_and_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role_and_status();

CREATE OR REPLACE FUNCTION public.protect_inventory_item_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT public.is_approved_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only approved administrators can add, edit, or delete inventory catalog items.';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF COALESCE(NEW.total_qty, -1) < 0 OR COALESCE(NEW.available_qty, -1) < 0 THEN
      RAISE EXCEPTION 'Inventory quantities cannot be negative.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_inventory_item_mutations ON public.inventory_items;
CREATE TRIGGER trg_protect_inventory_item_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_inventory_item_mutations();

CREATE OR REPLACE FUNCTION public.protect_borrow_request_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_approved_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only approved administrators can delete borrow requests.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_approved_user() THEN
      RAISE EXCEPTION 'Unauthorized: Approved membership is required to submit inventory requests.';
    END IF;

    IF COALESCE(NEW.quantity, 0) < 1 THEN
      RAISE EXCEPTION 'Invalid quantity: Must be at least 1.';
    END IF;

    IF NEW.expected_return_date IS NULL OR NEW.expected_return_date < ((NOW() AT TIME ZONE 'Asia/Kolkata')::date) THEN
      RAISE EXCEPTION 'Expected return date cannot be in the past.';
    END IF;

    IF NOT public.is_approved_admin() THEN
      IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only submit borrow requests for your own account.';
      END IF;

      IF COALESCE(NEW.status, 'pending') <> 'pending'
         OR NEW.approved_by IS NOT NULL
         OR NEW.borrow_date IS NOT NULL
         OR NEW.actual_return_date IS NOT NULL
         OR NEW.admin_notes IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: Members cannot pre-approve, issue, or alter requisition clearance fields.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.is_approved_admin() THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_approved_user() OR auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: Only approved administrators can approve, reject, return, or modify borrow requests.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.user_name IS DISTINCT FROM OLD.user_name
       OR NEW.user_email IS DISTINCT FROM OLD.user_email
       OR NEW.item_name IS DISTINCT FROM OLD.item_name
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.project_name IS DISTINCT FROM OLD.project_name
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.borrow_date IS DISTINCT FROM OLD.borrow_date
       OR NEW.expected_return_date IS DISTINCT FROM OLD.expected_return_date
       OR NEW.actual_return_date IS DISTINCT FROM OLD.actual_return_date
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Unauthorized: Only approved administrators can approve, reject, return, or alter borrow request clearance fields.';
    END IF;

    IF OLD.status NOT IN ('approved', 'overdue') OR COALESCE(NEW.admin_notes, '') NOT LIKE '[RETURN_REQUESTED]%' THEN
      RAISE EXCEPTION 'Unauthorized: Members can only submit a return request for their own active loan.';
    END IF;

    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_borrow_request_mutations ON public.borrow_requests;
CREATE TRIGGER trg_protect_borrow_request_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.borrow_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_borrow_request_mutations();

CREATE OR REPLACE FUNCTION public.update_inventory_on_borrow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_items
      WHERE id = NEW.item_id AND available_qty < NEW.quantity
    ) THEN
      RAISE EXCEPTION 'Insufficient vault stock available for this requisition.';
    END IF;

    UPDATE public.inventory_items
    SET available_qty = GREATEST(0, available_qty - NEW.quantity),
        status = CASE
          WHEN GREATEST(0, available_qty - NEW.quantity) = 0 THEN 'Out of Stock'
          WHEN GREATEST(0, available_qty - NEW.quantity) <= min_threshold THEN 'Low Stock'
          ELSE 'In Stock'
        END,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  END IF;

  IF NEW.status = 'returned' AND (OLD.status IN ('approved', 'overdue')) THEN
    UPDATE public.inventory_items
    SET available_qty = LEAST(total_qty, available_qty + NEW.quantity),
        status = CASE
          WHEN LEAST(total_qty, available_qty + NEW.quantity) <= min_threshold AND LEAST(total_qty, available_qty + NEW.quantity) > 0 THEN 'Low Stock'
          WHEN LEAST(total_qty, available_qty + NEW.quantity) > min_threshold THEN 'In Stock'
          ELSE 'Out of Stock'
        END,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_borrow_request_status_change ON public.borrow_requests;
CREATE TRIGGER on_borrow_request_status_change
  AFTER UPDATE OF status ON public.borrow_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_inventory_on_borrow();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'inventory_items', 'borrow_requests', 'activity_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END;
$$;

CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'member'
    AND status = 'pending'
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_approved_admin())
  WITH CHECK (auth.uid() = id OR public.is_approved_admin());

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE USING (public.is_approved_admin());

CREATE POLICY "Inventory is viewable by all users"
  ON public.inventory_items FOR SELECT USING (true);

CREATE POLICY "Admins can insert inventory items"
  ON public.inventory_items FOR INSERT WITH CHECK (public.is_approved_admin());

CREATE POLICY "Admins can update inventory items"
  ON public.inventory_items FOR UPDATE
  USING (public.is_approved_admin())
  WITH CHECK (public.is_approved_admin());

CREATE POLICY "Admins can delete inventory items"
  ON public.inventory_items FOR DELETE USING (public.is_approved_admin());

CREATE POLICY "Borrow requests viewable by owner or admin"
  ON public.borrow_requests FOR SELECT USING (
    auth.uid() = user_id OR public.is_approved_admin()
  );

CREATE POLICY "Approved users can create own pending borrow requests"
  ON public.borrow_requests FOR INSERT WITH CHECK (
    public.is_approved_user()
    AND auth.uid() = user_id
    AND status = 'pending'
    AND approved_by IS NULL
    AND borrow_date IS NULL
    AND actual_return_date IS NULL
  );

CREATE POLICY "Admins manage borrow requests or borrowers request return"
  ON public.borrow_requests FOR UPDATE
  USING (
    public.is_approved_admin()
    OR (
      public.is_approved_user()
      AND auth.uid() = user_id
      AND status IN ('approved', 'overdue')
    )
  )
  WITH CHECK (
    public.is_approved_admin()
    OR (
      public.is_approved_user()
      AND auth.uid() = user_id
      AND status IN ('approved', 'overdue')
      AND COALESCE(admin_notes, '') LIKE '[RETURN_REQUESTED]%'
    )
  );

CREATE POLICY "Admins can delete borrow requests"
  ON public.borrow_requests FOR DELETE USING (public.is_approved_admin());

CREATE POLICY "Activity logs viewable by admin or owner"
  ON public.activity_logs FOR SELECT USING (
    public.is_approved_admin() OR auth.uid() = user_id
  );

CREATE POLICY "Activity logs insertable by authenticated actor"
  ON public.activity_logs FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (user_id IS NULL OR user_id = auth.uid() OR public.is_approved_admin())
  );

CREATE POLICY "Activity logs are immutable against update"
  ON public.activity_logs FOR UPDATE USING (false);

CREATE POLICY "Activity logs are immutable against delete"
  ON public.activity_logs FOR DELETE USING (false);

