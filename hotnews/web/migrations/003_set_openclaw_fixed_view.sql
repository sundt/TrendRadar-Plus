-- Migration: Set fixed_view for openclaw column
-- Date: 2026-03-07
-- Description: OpenClaw 栏目固定为时间线模式，不可切换

UPDATE column_config
SET source_filter = '{"fixed_view":"timeline"}',
    updated_at = strftime('%s', 'now')
WHERE id = 'openclaw';