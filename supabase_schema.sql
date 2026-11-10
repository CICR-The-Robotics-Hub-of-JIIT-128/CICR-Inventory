-- ====================================================================
-- CICR INVENTORY PORTAL - SUPABASE DATABASE SCHEMA
-- Centre for Innovation, Creativity & Robotics
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Profiles Table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    roll_number TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Inventory Items Table
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    location TEXT DEFAULT '',
    total_qty INTEGER NOT NULL DEFAULT 1 CHECK (total_qty >= 0),
    available_qty INTEGER NOT NULL DEFAULT 1 CHECK (available_qty >= 0),
    min_threshold INTEGER DEFAULT 2 CHECK (min_threshold >= 0),
    condition TEXT DEFAULT 'Good',
    status TEXT DEFAULT 'In Stock' CHECK (status IN ('In Stock', 'Low Stock', 'Out of Stock', 'Maintenance')),
    image_url TEXT,
    datasheet_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'Good';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

UPDATE public.profiles
SET status = CASE
  WHEN avatar_url = 'status:pending' THEN 'pending'
  WHEN avatar_url = 'status:rejected' THEN 'rejected'
  ELSE COALESCE(status, 'pending')
END
WHERE status IS NULL OR avatar_url IN ('status:pending', 'status:rejected');

ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1
   FROM pg_class AS index_class
   JOIN pg_namespace AS index_schema
     ON index_schema.oid = index_class.relnamespace
   WHERE index_schema.nspname = 'public'
     AND index_class.relname = 'inventory_items_sku_key'
     AND index_class.relkind = 'i'
 ) THEN
   CREATE UNIQUE INDEX inventory_items_sku_key
     ON public.inventory_items (sku);
 END IF;
END;
$$;

-- 4. Create Borrow Requests Table
CREATE TABLE IF NOT EXISTS public.borrow_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    project_name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'overdue')),
    borrow_date DATE,
    expected_return_date DATE NOT NULL,
    actual_return_date DATE,
    approved_by TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    item_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Function to handle new user registration automatically
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
  resolved_role TEXT;
  resolved_status TEXT;
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

  resolved_role := 'member';
  resolved_status := 'pending';

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

-- Helper: checks whether current authenticated user is an approved DB member or admin
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

-- Helper: checks whether current authenticated user is an approved DB administrator
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

-- Guardrail: blocks non-admins and self-targeting updates to role/status (runs SECURITY INVOKER)
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

-- Guardrail: restricts catalog item creation, modification, and deletion strictly to approved administrators
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

-- Guardrail: locks borrow request approvals, rejections, clearances, and deletions strictly to approved admins
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

-- Trigger for auth.users on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Trigger to auto-update available_qty when borrow request is approved/returned
CREATE OR REPLACE FUNCTION public.update_inventory_on_borrow()
RETURNS TRIGGER AS $$
BEGIN
  -- When request is approved
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

  -- When request is returned
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

-- 8. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 9. Dynamically drop all legacy permissive policies before recreating strict RBAC policies
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

-- Profiles: public read for duplicate/roster lookup, self-insert locked to member+pending, admin or self update (trigger locks role/status)
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (
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

-- Inventory items: readable by anyone, mutable strictly by approved administrators
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

-- Borrow requests: members view/create own pending requests and initiate own returns; admins control approve/reject/return/delete
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

-- Activity logs: readable by approved admins or owning user; insertable only for own activity or by admin; immutable
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

-- 10. Initial Seed Data for CICR Inventory (53 Authentic Components, 172 Total Assets)
INSERT INTO public.inventory_items (name, sku, category, description, location, total_qty, available_qty, min_threshold, condition, status, image_url, datasheet_url)
VALUES
('5-Channel Infrared Tracking Sensor', 'CICR-SEN-003', 'Sensors & Modules', '5-channel TCRT5000 IR Line Tracking Sensor array module for line-following autonomous robotics.', 'Sensors Bay - Rack S3, Box 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('8×8 LED Matrix', 'CICR-TOOL-008', 'Tools & Fabrication', '8x8 Red LED Dot Matrix Display Module with MAX7219 serial driver IC for text, shapes, and animations.', 'Display & Output Unit - Drawer O1, Tray 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Arduino Cables', 'CICR-TOOL-004', 'Tools & Fabrication', 'USB Type-A to Type-B / Mini-USB programming cables and heavy-duty jumper wire sets for Arduino boards.', 'Mechanical Bay - Bin M2, Rack 1', 12, 12, 2, 'Good', 'In Stock', NULL, NULL),
('Arduino Nano', 'CICR-MCU-005', 'Microcontrollers & SBCs', 'Compact ATmega328P 16MHz Microcontroller Board with 14 digital I/O, 8 analog inputs, and Mini-USB/Type-C interface.', 'Controllers Bay - Rack C1, Tray 1', 4, 4, 1, 'Good', 'In Stock', NULL, NULL),
('Arduino Uno R3', 'CICR-MCU-004', 'Microcontrollers & SBCs', 'Arduino Uno R3 ATmega328P Microcontroller Board with 14 digital I/O pins, 6 analog inputs, and 16MHz crystal oscillator.', 'Controllers Bay - Rack C1, Tray 2', 7, 7, 1, 'Good', 'In Stock', NULL, NULL),
('AVR / 8051 USB ISP Programmer', 'CICR-MCU-001', 'Microcontrollers & SBCs', 'USB-ASP In-System Programmer (ISP) with 10-pin IDC cable for flashing Atmel AVR (ATmega/ATtiny) and 8051 microcontrollers.', 'Controllers Bay - Rack C2, Bin 1', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Batteries', 'CICR-PWR-004', 'Power & Batteries', 'High-Discharge Lithium-Polymer (LiPo) / 18650 Li-Ion rechargeable battery packs for combat robots and aerial drones.', 'Power Station - Cabinet P1, Fireproof Safe', 11, 11, 2, 'Good', 'In Stock', NULL, NULL),
('Battery Chargers', 'CICR-PWR-005', 'Power & Batteries', 'Smart Microprocessor Balance Charger and Discharger for LiPo, Li-Ion, NiMH, and Lead-Acid robotics batteries.', 'Power Station - Cabinet P1, Shelf 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('BL Helicopter 30A ESC', 'CICR-MOT-001', 'Motors & Drivers', '30A Brushless Helicopter Electronic Speed Controller (ESC) with 5V/2A BEC, soft-start governor, and multi-cell LiPo support.', 'Drivers & ESC Bay - Cabinet D1, Bin 6', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('BLDC Motor — New', 'CICR-MOT-009', 'Motors & Drivers', 'Brand-new high-KV Brushless DC (BLDC) outrunner motor for quadcopter propulsion and high-speed robotic systems.', 'Actuators Bay - Drawer M3, Section 1', 4, 4, 1, 'Good', 'In Stock', NULL, NULL),
('BLDC Motor — Old', 'CICR-MOT-008', 'Motors & Drivers', 'Bench-tested Brushless DC (BLDC) outrunner motor for lab prototyping, aeromodelling tests, and test-rig experimentation.', 'Actuators Bay - Drawer M3, Section 2', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('BTS7960 Motor Driver', 'CICR-MOT-002', 'Motors & Drivers', 'BTS7960 43A High-Power Semiconductor Dual H-Bridge Motor Driver Module with thermal shutdown and current sensing.', 'Drivers & ESC Bay - Cabinet D1, Bin 5', 9, 9, 2, 'Good', 'In Stock', NULL, NULL),
('Buck Converter', 'CICR-PWR-003', 'Power & Batteries', 'LM2596 / MP1584 Step-Down DC-DC Buck Converter Module with adjustable output voltage (4V-35V in, 1.23V-30V out).', 'Power Station - Cabinet P2, Bin 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Buzzer Module', 'CICR-TOOL-007', 'Tools & Fabrication', 'Piezoelectric Active/Passive Audible Buzzer Module with transistor driver for alarm beeps and frequency tones.', 'Display & Output Unit - Drawer O1, Tray 4', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('CT6B Remote', 'CICR-TOOL-014', 'Tools & Fabrication', 'FlySky FS-CT6B 2.4GHz 6-Channel Radio Transmitter and matched receiver set for RC aircraft and autonomous rovers.', 'Comms & RF Station - Cabinet R1, Shelf 2', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('DJI BLDC', 'CICR-MOT-007', 'Motors & Drivers', 'Original DJI tuned brushless motor for heavy-lift multirotor propulsion with precision bearings and balanced rotor.', 'Actuators Bay - Drawer M3, Section 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Dual DC Motor Driver — TB6612FNG', 'CICR-MOT-005', 'Motors & Drivers', 'TB6612FNG Dual H-Bridge Motor Driver Carrier module (1.2A continuous / 3.2A peak per channel, high efficiency MOSFET output).', 'Drivers & ESC Bay - Cabinet D1, Bin 2', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('ESC', 'CICR-MOT-006', 'Motors & Drivers', 'Electronic Speed Controller (ESC) with integrated BEC for brushless DC motor drive and PWM throttle control.', 'Drivers & ESC Bay - Cabinet D1, Bin 1', 7, 7, 1, 'Good', 'In Stock', NULL, NULL),
('ESP Cables', 'CICR-TOOL-003', 'Tools & Fabrication', 'High-speed shielded Micro-USB and USB-C data synchronization cables for ESP32/ESP8266 development boards.', 'Mechanical Bay - Bin M2, Rack 2', 10, 10, 2, 'Good', 'In Stock', NULL, NULL),
('ESP32', 'CICR-MCU-003', 'Microcontrollers & SBCs', 'ESP-WROOM-32 32-bit Dual-Core 240MHz Wi-Fi + Bluetooth BLE Microcontroller Development Board.', 'Controllers Bay - Rack C1, Tray 3', 6, 6, 1, 'Good', 'In Stock', NULL, NULL),
('ESP32-CAM', 'CICR-MCU-002', 'Microcontrollers & SBCs', 'ESP32 Development Board integrated with OV2640 2MP Camera module and TF/microSD card slot for computer vision & IoT streaming.', 'Controllers Bay - Rack C1, Tray 4', 4, 4, 1, 'Good', 'In Stock', NULL, NULL),
('FlySky FS-i6 Remote', 'CICR-TOOL-013', 'Tools & Fabrication', 'FlySky FS-i6 6-Channel 2.4GHz AFHDS 2A Digital Proportional Radio Control System with LCD telemetry display.', 'Comms & RF Station - Cabinet R1, Shelf 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Gyroscope / Accelerometer', 'CICR-SEN-009', 'Sensors & Modules', 'MPU-6050 6-Axis Motion Tracking Sensor (3-Axis Gyroscope + 3-Axis Accelerometer) with I2C interface.', 'Sensors Bay - Rack S2, Box 1', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('I²C Serial Interface Module', 'CICR-TOOL-002', 'Tools & Fabrication', 'PCF8574 I2C Serial Backpack Interface Module for driving 1602 / 2004 character LCD displays using only 2 MCU pins.', 'Mechanical Bay - Bin M3, Tray 1', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Ignition Wires', 'CICR-TOOL-006', 'Tools & Fabrication', 'Heavy-duty high-temperature silicone insulated ignition and spark-gap wiring set for internal combustion and pyrotechnics.', 'Mechanical Bay - Bin M1, Section 1', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('IR Receivers', 'CICR-SEN-002', 'Sensors & Modules', 'TSOP38238 / VS1838B 38kHz Infrared Remote Control Receiver Sensor modules with integrated demodulator.', 'Sensors Bay - Rack S3, Box 4', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('IR Sensor', 'CICR-SEN-004', 'Sensors & Modules', 'Infrared Obstacle Avoidance Proximity Sensor with IR transmitter, receiver diode, and comparator circuit.', 'Sensors Bay - Rack S3, Box 2', 5, 5, 1, 'Good', 'In Stock', NULL, NULL),
('IR Wireless Remote — 21 Keys', 'CICR-TOOL-012', 'Tools & Fabrication', '21-Key Infrared Wireless Remote Control transmitter keypad with standard NEC protocol and CR2025/CR2032 coin cell.', 'Comms & RF Station - Cabinet R2, Bin 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Joystick', 'CICR-TOOL-011', 'Tools & Fabrication', 'Dual-Axis Analog PS2 Thumb Joystick Module (X/Y potentiometers + integrated tactile pushbutton).', 'Comms & RF Station - Cabinet R2, Bin 2', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('L293N Motor Driver', 'CICR-MOT-003', 'Motors & Drivers', 'L293 / L293D dual full-bridge push-pull four-channel motor driver board with clamp diodes for inductive loads.', 'Drivers & ESC Bay - Cabinet D1, Bin 4', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('L298D Motor Driver', 'CICR-MOT-004', 'Motors & Drivers', 'High-power dual full-bridge motor driver module with onboard 5V regulator and heat sink for high current DC/stepper loads.', 'Drivers & ESC Bay - Cabinet D1, Bin 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('LDR Sensor', 'CICR-SEN-011', 'Sensors & Modules', 'Light Dependent Resistor (Photoresistor) sensor module with onboard potentiometer for ambient light threshold detection.', 'Sensors Bay - Rack S1, Box 4', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('Light / Hall Effect Sensor', 'CICR-SEN-007', 'Sensors & Modules', 'Combined Hall Effect Magnetic Field and Ambient Light detection module for positional tracking and proximity sensing.', 'Sensors Bay - Rack S2, Box 3', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('LM35CAZ Temperature Sensor', 'CICR-SEN-006', 'Sensors & Modules', 'Precision Centigrade Temperature Sensor IC in TO-92 package with linear +10.0 mV/°C scale factor (-55°C to 150°C).', 'Sensors Bay - Rack S2, Box 4', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('MG90S Servo', 'CICR-MOT-013', 'Motors & Drivers', 'Micro Metal Gear Servo Motor (180 degree rotation, stall torque 2.2kg-cm at 6V, weight 13.4g) with mounting horns.', 'Actuators Bay - Drawer M1, Section 2', 8, 8, 2, 'Good', 'In Stock', NULL, NULL),
('MG995 Servo', 'CICR-MOT-014', 'Motors & Drivers', 'High-Torque Metal Gear Standard Servo Motor (180 degree rotation, stall torque 10kg-cm to 13kg-cm at 6V).', 'Actuators Bay - Drawer M1, Section 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Moisture Sensor', 'CICR-SEN-013', 'Sensors & Modules', 'Soil moisture and humidity detection sensor probe with LM393 comparator module for analog/digital reading.', 'Sensors Bay - Rack S1, Box 2', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Neo-6M GPS Module', 'CICR-SEN-001', 'Sensors & Modules', 'u-blox NEO-6M High Sensitivity Satellite GPS Positioning Module with ceramic patch antenna and EEPROM (UART).', 'Sensors Bay - Rack S3, Box 5', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('OLED Display', 'CICR-TOOL-010', 'Tools & Fabrication', '0.96-inch Monochrome 128x64 I2C OLED Display Module (SSD1306 driver, 3.3V/5V compatible, high contrast).', 'Display & Output Unit - Drawer O1, Tray 1', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('PIR Motion Sensor', 'CICR-SEN-014', 'Sensors & Modules', 'HC-SR501 Passive Infrared (PIR) Motion Detector module with adjustable sensitivity and delay time (3.3V-5V DC).', 'Sensors Bay - Rack S1, Box 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Potentiometer', 'CICR-PWR-001', 'Power & Batteries', 'Standard 10k Rotary Precision Potentiometer with knurled shaft for voltage dividing, tuning, and sensor calibration.', 'Power Station - Cabinet P2, Bin 3', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('Pump Motor', 'CICR-MOT-010', 'Motors & Drivers', 'Miniature 3V-6V DC Submersible Fluid / Water Pump Motor for automated dispensing and fluid transfer robotics.', 'Actuators Bay - Drawer M2, Section 2', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Radio Telemetry Kit — S-CU3E', 'CICR-TOOL-015', 'Tools & Fabrication', 'S-CU3E Long-Range Radio Telemetry Transceiver Kit with paired ground and air modules (433MHz/915MHz) for MAVLink telemetry.', 'Comms & RF Station - Cabinet R1, Shelf 1', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Relay Module', 'CICR-PWR-002', 'Power & Batteries', '5V Optocoupler-Isolated Single/Multi-Channel Relay Module for switching AC 250V/10A or DC 30V/10A high-power circuits.', 'Power Station - Cabinet P2, Bin 2', 5, 5, 1, 'Good', 'In Stock', NULL, NULL),
('Resistor Box', 'CICR-TOOL-005', 'Tools & Fabrication', 'Comprehensive 1/4W Metal Film Resistor Assortment Kit Box containing common values from 10 ohm to 1M ohm.', 'Mechanical Bay - Bin M1, Section 2', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('RUN CAM', 'CICR-TOOL-001', 'Tools & Fabrication', 'RunCam Micro / Swift High-Resolution Ultra-Low Latency FPV Camera (1/3" Sony CCD sensor, WDR, OSD) for drone piloting.', 'Mechanical Bay - Bin M3, Tray 2', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('SG90 Servo', 'CICR-MOT-012', 'Motors & Drivers', 'Ultra-lightweight 9g Micro Servo Motor with nylon gear train for aeromodelling, pan-tilt heads, and miniature robotics.', 'Actuators Bay - Drawer M1, Section 3', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Stepper Motor', 'CICR-MOT-011', 'Motors & Drivers', 'Bipolar 4-wire Stepper Motor (NEMA standard) for precise angular positioning and CNC / 3D printer axis propulsion.', 'Actuators Bay - Drawer M2, Section 1', 8, 8, 2, 'Good', 'In Stock', NULL, NULL),
('Temperature & Humidity Sensor', 'CICR-SEN-012', 'Sensors & Modules', 'DHT11 / DHT22 Digital Temperature and Humidity Sensor with single-bus digital signal output.', 'Sensors Bay - Rack S1, Box 3', 2, 2, 1, 'Good', 'In Stock', NULL, NULL),
('TFT Display — 2.4 inch', 'CICR-TOOL-009', 'Tools & Fabrication', '2.4-inch Full Color 240x320 SPI TFT LCD Display Module with integrated resistive touch panel and SD card slot.', 'Display & Output Unit - Drawer O1, Tray 2', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Touch Sensor', 'CICR-SEN-010', 'Sensors & Modules', 'TTP223 Capacitive Touch Switch Sensor Module with low power consumption and momentary/toggle modes.', 'Sensors Bay - Rack S1, Box 5', 1, 1, 1, 'Good', 'In Stock', NULL, NULL),
('Ultrasonic Sensor', 'CICR-SEN-005', 'Sensors & Modules', 'HC-SR04 Ultrasonic Distance Measuring Transceiver Module (range 2cm - 400cm, 5V DC, trigger/echo).', 'Sensors Bay - Rack S3, Box 1', 3, 3, 1, 'Good', 'In Stock', NULL, NULL),
('Vibration Sensor', 'CICR-SEN-008', 'Sensors & Modules', 'SW-420 Normally Closed Vibration Sensor Module with LM393 comparator for impact, shake, and tamper detection.', 'Sensors Bay - Rack S2, Box 2', 1, 1, 1, 'Good', 'In Stock', NULL, NULL)
ON CONFLICT (sku) DO NOTHING;

-- Migration: Make location optional
ALTER TABLE public.inventory_items ALTER COLUMN location DROP NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN location SET DEFAULT '';
