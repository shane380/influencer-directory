-- Drop the wide-open authenticated policies on creators
DROP POLICY IF EXISTS "Authenticated users can insert creators" ON creators;
DROP POLICY IF EXISTS "Authenticated users can view creators" ON creators;
DROP POLICY IF EXISTS "Authenticated users can update creators" ON creators;

-- Creators can only see their own row
CREATE POLICY "Creators can view own row"
  ON creators FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Creators can only update their own row
CREATE POLICY "Creators can update own row"
  ON creators FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Creators can insert their own row (onboarding)
CREATE POLICY "Creators can insert own row"
  ON creators FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins and managers can read all creators
CREATE POLICY "Admin/manager can view all creators"
  ON creators FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
  );

-- Admins and managers can update all creators
CREATE POLICY "Admin/manager can update all creators"
  ON creators FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR is_manager = true))
  );
