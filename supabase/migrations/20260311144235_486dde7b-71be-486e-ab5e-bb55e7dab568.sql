
-- Convert gross_margin_value and gross_margin_percent to GENERATED columns
ALTER TABLE projects DROP COLUMN IF EXISTS gross_margin_value;
ALTER TABLE projects DROP COLUMN IF EXISTS gross_margin_percent;

ALTER TABLE projects ADD COLUMN gross_margin_value numeric GENERATED ALWAYS AS (sold_value - direct_costs) STORED;
ALTER TABLE projects ADD COLUMN gross_margin_percent numeric GENERATED ALWAYS AS (CASE WHEN sold_value > 0 THEN ((sold_value - direct_costs) / sold_value * 100) ELSE 0 END) STORED;
