-- The creator leaderboard redacts other creators' revenue/spend server-side,
-- but these authenticated-read policies let any logged-in creator query the
-- raw daily tables directly through the REST API with the anon key.
-- All legitimate readers use the service-role client, which bypasses RLS.
DROP POLICY IF EXISTS "Allow authenticated read" ON creator_ad_performance_daily;
DROP POLICY IF EXISTS "Allow authenticated read" ON creator_code_revenue_daily;
