-- Let meta_ad_daily.purchases be NULL, meaning "not known for this ad-day".
--
-- creator_ad_performance_daily has ~7 months of partnership-ad history that
-- predates meta_ad_daily, and backfilling it costs zero Meta calls. But that
-- older table never stored a purchase COUNT — only purchase_value. Inserting
-- those rows with purchases = 0 would silently understate the Purchases metric
-- and produce a confidently wrong CPA and AOV for any range reaching back into
-- the backfilled period.
--
-- NULL keeps "we don't know" distinct from "there were none", so the API can
-- report purchase coverage per range and the page can show "—" instead of a
-- wrong number. Rows written by the live sync continue to carry a real count.
ALTER TABLE meta_ad_daily ALTER COLUMN purchases DROP NOT NULL;

COMMENT ON COLUMN meta_ad_daily.purchases IS
  'Purchase count. NULL means unknown for this ad-day (backfilled from creator_ad_performance_daily, which never stored a count) — not zero.';
