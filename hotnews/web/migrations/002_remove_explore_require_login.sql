-- Migration: Remove require_login from explore column
-- Date: 2025-01-01
-- Description: explore（精选博客）is public content and should not require login to browse.
--              Only my-tags (personalized content) should keep require_login: true.

UPDATE column_config
SET source_filter = '{"fixed_view":"timeline"}',
    updated_at = strftime('%s', 'now')
WHERE id = 'explore'
  AND source_filter LIKE '%require_login%';
