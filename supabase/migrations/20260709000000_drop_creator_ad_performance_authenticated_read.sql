-- creator_ad_performance is only read server-side with the service-role key
-- (which bypasses RLS). The blanket authenticated-read policy let any
-- logged-in user query every creator's spend data directly via the anon key.
DROP POLICY IF EXISTS "Allow authenticated read" ON creator_ad_performance;
