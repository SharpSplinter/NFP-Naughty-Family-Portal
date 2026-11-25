ALTER TABLE global_star_income_buffers ADD COLUMN third_lowest_weekly_income REAL;

-- Rebuild any existing compact benchmark rows from the exact matching full
-- global-rank snapshot. This keeps the already-saved weekly snapshot usable
-- while applying the new zero-income exclusion and third-lowest rule.
UPDATE global_star_income_buffers
SET
  company_count = (
    SELECT COUNT(*)
    FROM global_company_rank_snapshots AS source
    WHERE source.reporting_day = global_star_income_buffers.reporting_day
      AND source.company_type_id = global_star_income_buffers.company_type_id
      AND source.star_rating = global_star_income_buffers.star_rating
      AND source.source_fetched_at = global_star_income_buffers.source_started_at
      AND source.weekly_income IS NOT NULL
      AND (global_star_income_buffers.star_rating = 0 OR source.weekly_income <> 0)
  ),
  min_weekly_income = (
    SELECT MIN(source.weekly_income)
    FROM global_company_rank_snapshots AS source
    WHERE source.reporting_day = global_star_income_buffers.reporting_day
      AND source.company_type_id = global_star_income_buffers.company_type_id
      AND source.star_rating = global_star_income_buffers.star_rating
      AND source.source_fetched_at = global_star_income_buffers.source_started_at
      AND source.weekly_income IS NOT NULL
      AND (global_star_income_buffers.star_rating = 0 OR source.weekly_income <> 0)
  ),
  max_weekly_income = (
    SELECT MAX(source.weekly_income)
    FROM global_company_rank_snapshots AS source
    WHERE source.reporting_day = global_star_income_buffers.reporting_day
      AND source.company_type_id = global_star_income_buffers.company_type_id
      AND source.star_rating = global_star_income_buffers.star_rating
      AND source.source_fetched_at = global_star_income_buffers.source_started_at
      AND source.weekly_income IS NOT NULL
      AND (global_star_income_buffers.star_rating = 0 OR source.weekly_income <> 0)
  ),
  third_lowest_weekly_income = (
    SELECT source.weekly_income
    FROM global_company_rank_snapshots AS source
    WHERE source.reporting_day = global_star_income_buffers.reporting_day
      AND source.company_type_id = global_star_income_buffers.company_type_id
      AND source.star_rating = global_star_income_buffers.star_rating
      AND source.source_fetched_at = global_star_income_buffers.source_started_at
      AND source.weekly_income IS NOT NULL
      AND (global_star_income_buffers.star_rating = 0 OR source.weekly_income <> 0)
    ORDER BY source.weekly_income ASC, source.company_id ASC
    LIMIT 1 OFFSET 2
  )
WHERE EXISTS (
  SELECT 1
  FROM global_company_rank_snapshots AS source
  WHERE source.reporting_day = global_star_income_buffers.reporting_day
    AND source.company_type_id = global_star_income_buffers.company_type_id
    AND source.star_rating = global_star_income_buffers.star_rating
    AND source.source_fetched_at = global_star_income_buffers.source_started_at
    AND source.weekly_income IS NOT NULL
    AND (global_star_income_buffers.star_rating = 0 OR source.weekly_income <> 0)
);

UPDATE global_star_income_buffer_snapshots
SET benchmark_company_count = (
  SELECT COALESCE(SUM(buffer.company_count), 0)
  FROM global_star_income_buffers AS buffer
  WHERE buffer.reporting_day = global_star_income_buffer_snapshots.reporting_day
)
WHERE EXISTS (
  SELECT 1
  FROM global_company_rank_snapshots AS source
  WHERE source.reporting_day = global_star_income_buffer_snapshots.reporting_day
    AND source.source_fetched_at = global_star_income_buffer_snapshots.source_started_at
);
