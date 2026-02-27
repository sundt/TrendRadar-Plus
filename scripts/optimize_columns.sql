-- ============================================================
-- 栏目优化：财经扩充子分类 + 科学健康精简层级
-- ============================================================

-- ==================== 财经 ====================

-- 1. 修改现有 fin-commodity：去掉 gold，只保留 commodity/oil
UPDATE column_config SET tag_ids = '["commodity","oil"]' WHERE id = 'fin-commodity';

-- 2. 新增：黄金
INSERT OR IGNORE INTO column_config (id, name, parent_id, tag_ids, source_filter, default_view, sort_order, enabled, created_at, updated_at)
VALUES ('fin-gold', '黄金', 'finance', '["gold","gold_price_surge"]', '{}', 'timeline', 4, 1, strftime('%s','now'), strftime('%s','now'));

-- 3. 新增：房地产
INSERT OR IGNORE INTO column_config (id, name, parent_id, tag_ids, source_filter, default_view, sort_order, enabled, created_at, updated_at)
VALUES ('fin-realestate', '房地产', 'finance', '["real_estate"]', '{}', 'timeline', 5, 1, strftime('%s','now'), strftime('%s','now'));

-- 4. 新增：银行保险
INSERT OR IGNORE INTO column_config (id, name, parent_id, tag_ids, source_filter, default_view, sort_order, enabled, created_at, updated_at)
VALUES ('fin-banking', '银行保险', 'finance', '["banking","insurance"]', '{}', 'timeline', 6, 1, strftime('%s','now'), strftime('%s','now'));

-- 5. 调整 sort_order 让大宗商品排在黄金后面
UPDATE column_config SET sort_order = 3 WHERE id = 'fin-commodity';
UPDATE column_config SET sort_order = 4 WHERE id = 'fin-gold';
UPDATE column_config SET sort_order = 5 WHERE id = 'fin-realestate';
UPDATE column_config SET sort_order = 6 WHERE id = 'fin-banking';

-- ==================== 科学健康 ====================
-- 策略：删除所有三级分类，把 tag_ids 合并到二级分类上

-- 6. 航天能源：合并 commercial_spaceflight + space_solar_power + fusion_energy
UPDATE column_config SET tag_ids = '["commercial_spaceflight","space_solar_power","fusion_energy"]' WHERE id = 'sci-space';
DELETE FROM column_config WHERE id IN ('sci-space-commercial', 'sci-space-solar', 'sci-space-fusion');

-- 7. 机器人：合并 humanoid_robot + unitree + optimus
UPDATE column_config SET tag_ids = '["humanoid_robot","unitree","optimus","robotics"]' WHERE id = 'sci-robot';
DELETE FROM column_config WHERE id IN ('sci-robot-humanoid', 'sci-robot-unitree', 'sci-robot-optimus');

-- 8. 生物医药：合并 gene_editing + drug_discovery
UPDATE column_config SET tag_ids = '["gene_editing","drug_discovery","biotech"]' WHERE id = 'sci-biotech';
DELETE FROM column_config WHERE id IN ('sci-biotech-gene', 'sci-biotech-drug');

-- 9. 前沿科技：合并 quantum_computing + ufo_disclosure
UPDATE column_config SET tag_ids = '["quantum_computing","ufo_disclosure"]' WHERE id = 'sci-frontier';
DELETE FROM column_config WHERE id IN ('sci-frontier-quantum', 'sci-frontier-ufo');

-- ==================== 确认 gold_price_surge 标签存在 ====================
INSERT OR IGNORE INTO tags (id, name, name_en, type, parent_id, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('gold_price_surge', '金价暴涨', 'Gold Price Surge', 'topic', 'finance', 1, 'active', 0, strftime('%s','now'), strftime('%s','now'));

-- 确认 gold 标签存在
INSERT OR IGNORE INTO tags (id, name, name_en, type, parent_id, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('gold', '黄金', 'Gold', 'topic', 'finance', 0, 'active', 0, strftime('%s','now'), strftime('%s','now'));

-- 确认 biotech 标签存在
INSERT OR IGNORE INTO tags (id, name, name_en, type, parent_id, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('biotech', '生物科技', 'Biotech', 'topic', 'science', 0, 'active', 0, strftime('%s','now'), strftime('%s','now'));

-- ==================== Region 标签 ====================
INSERT OR IGNORE INTO tags (id, name, name_en, type, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('region:cn', '中国', 'China', 'region', 0, 'active', 0, strftime('%s','now'), strftime('%s','now'));
INSERT OR IGNORE INTO tags (id, name, name_en, type, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('region:us', '美国', 'United States', 'region', 0, 'active', 0, strftime('%s','now'), strftime('%s','now'));
INSERT OR IGNORE INTO tags (id, name, name_en, type, is_dynamic, lifecycle, usage_count, created_at, updated_at)
VALUES ('region:global', '全球', 'Global', 'region', 0, 'active', 0, strftime('%s','now'), strftime('%s','now'));
