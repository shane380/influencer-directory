-- Ads template library: collections become nestable folders (e.g.
-- "Between Hours" › "Whitelisting"), and saved pieces no longer need a name —
-- the copy itself is the template.

-- 1. Folders can have a parent folder. Deleting a folder removes its subfolders
--    (and, via the existing FK, every template inside them).
ALTER TABLE ad_template_collections
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES ad_template_collections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ad_template_collections_parent_idx
  ON ad_template_collections (parent_id);

-- Names only need to be unique among siblings (same parent, top level = NULL).
DROP INDEX IF EXISTS ad_template_collections_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ad_template_collections_sibling_name_key
  ON ad_template_collections (
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- 2. Templates are identified by their content, not a name.
ALTER TABLE ad_templates ALTER COLUMN name DROP NOT NULL;
DROP INDEX IF EXISTS ad_templates_name_key;
