-- Add new columns for Phase 1 optimization
-- data_summary: Structured data summary generated before AI analysis
-- data_quality_score: 0-100 score indicating data sufficiency
-- keywords_used: All keywords used for search across dimensions

ALTER TABLE validation_reports 
ADD COLUMN IF NOT EXISTS data_summary JSONB DEFAULT '{}'::jsonb;

ALTER TABLE validation_reports 
ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT NULL;

ALTER TABLE validation_reports 
ADD COLUMN IF NOT EXISTS keywords_used JSONB DEFAULT '[]'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN validation_reports.data_summary IS 'Structured data summary including pain point clusters, competitor matrix, and market signals';
COMMENT ON COLUMN validation_reports.data_quality_score IS 'Data sufficiency score 0-100, higher means more reliable analysis';
COMMENT ON COLUMN validation_reports.keywords_used IS 'All keywords used for multi-dimensional search';