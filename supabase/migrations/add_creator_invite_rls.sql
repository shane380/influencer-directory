-- Allow newly signed-up creators to insert their own row
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert creators"
  ON creators FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view creators"
  ON creators FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update creators"
  ON creators FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
