# 任务清单：AI 动态标签演化系统

## 📋 项目信息

**项目名称**: AI 动态标签演化系统  
**预计工作量**: 3-5 天  
**优先级**: 中  
**状态**: 待开始

## 🎯 Phase 1: 基础设施（1-2 天）

### 1.1 数据库迁移

- [ ] **创建 tag_candidates 表**
  - 文件：`hotnews/storage/migrations/add_tag_candidates.sql`
  - 包含所有字段和索引
  - 测试：插入、查询、更新候选标签

- [ ] **创建 tag_evolution_log 表**
  - 文件：`hotnews/storage/migrations/add_tag_evolution_log.sql`
  - 包含所有字段和索引
  - 测试：记录各种演化动作

- [ ] **扩展 tags 表**
  - 文件：`hotnews/storage/migrations/extend_tags_table.sql`
  - 添加新字段：is_dynamic, lifecycle, usage_count, last_used_at, promoted_from, quality_score
  - 测试：更新现有标签，查询新字段

- [ ] **创建数据库迁移脚本**
  - 文件：`scripts/migrate_tag_evolution.py`
  - 自动执行所有迁移
  - 支持回滚

### 1.2 数据模型

- [ ] **创建 TagCandidate 模型**
  - 文件：`hotnews/kernel/models/tag_candidate.py`
  - 包含所有字段和验证逻辑
  - 实现 to_dict(), from_dict() 方法

- [ ] **创建 TagEvolutionLog 模型**
  - 文件：`hotnews/kernel/models/tag_evolution_log.py`
  - 支持各种 action 类型
  - 实现日志查询方法

- [ ] **扩展 Tag 模型**
  - 文件：`hotnews/kernel/models/tag.py`（如果不存在则创建）
  - 添加新字段的访问方法
  - 实现标签健康度计算

### 1.3 基础服务

- [ ] **创建 TagCandidateService**
  - 文件：`hotnews/kernel/services/tag_candidate_service.py`
  - CRUD 操作
  - 统计查询（按状态、置信度、出现次数）

- [ ] **创建 TagEvolutionLogService**
  - 文件：`hotnews/kernel/services/tag_evolution_log_service.py`
  - 记录演化日志
  - 查询演化历史

## 🤖 Phase 2: AI 集成（1-2 天）

### 2.1 Prompt 更新

- [ ] **更新 AI Prompt 模板**
  - 文件：`hotnews/kernel/scheduler/rss_scheduler.py`
  - 添加动态标签发现模式
  - 提供新标签示例和规则
  - 测试：验证 AI 能正确返回新标签

- [ ] **实现 Prompt 生成逻辑**
  - 动态加载预设标签列表
  - 格式化为 AI 可读格式
  - 支持中英文标签名称

### 2.2 标签发现服务

- [ ] **创建 TagDiscoveryService**
  - 文件：`hotnews/kernel/services/tag_discovery_service.py`
  - 实现 extract_new_tags() - 从 AI 响应提取新标签
  - 实现 normalize_tag_id() - 标签 ID 规范化
  - 实现 detect_duplicates() - 检测重复标签
  - 实现 save_candidate() - 保存到候选池

- [ ] **实现标签规范化规则**
  - 命名规则验证（小写、下划线、长度限制）
  - 同义词映射
  - 黑名单过滤
  - 类型约束检查

- [ ] **集成到 RSS 调度器**
  - 文件：`hotnews/kernel/scheduler/rss_scheduler.py`
  - 在 AI 标注流程中调用 TagDiscoveryService
  - 同时保存固定标签和新标签
  - 记录演化日志

### 2.3 测试

- [ ] **单元测试**
  - 文件：`tests/test_tag_discovery.py`
  - 测试标签提取
  - 测试标签规范化
  - 测试重复检测

- [ ] **集成测试**
  - 文件：`tests/test_tag_ai_integration.py`
  - 测试完整的 AI 标注流程
  - 验证新标签正确保存到候选池

## 🔄 Phase 3: 生命周期管理（1-2 天）

### 3.1 标签验证服务

- [ ] **创建 TagValidationService**
  - 文件：`hotnews/kernel/services/tag_validation_service.py`
  - 实现 get_qualified_candidates() - 获取合格候选标签
  - 实现 calculate_tag_quality() - 计算标签质量分数
  - 实现 promote_to_official() - 晋升为正式标签
  - 实现 reject_low_quality_candidates() - 拒绝低质量标签

- [ ] **实现晋升条件检查**
  - 基础条件：出现次数、置信度、时间跨度
  - 质量条件：高频、高置信度、人工批准
  - 配置化：支持通过配置文件调整条件

- [ ] **实现晋升流程**
  - 从 tag_candidates 复制到 tags
  - 更新相关的 rss_entry_tags 记录
  - 记录演化日志
  - 发送通知（可选）

### 3.2 标签演化服务

- [ ] **创建 TagEvolutionService**
  - 文件：`hotnews/kernel/services/tag_evolution_service.py`
  - 实现 merge_similar_tags() - 合并相似标签
  - 实现 split_hot_tag() - 分裂热门标签
  - 实现 upgrade_tag() - 升级标签类型
  - 实现 downgrade_tag() - 降级标签类型

- [ ] **实现标签相似度计算**
  - 基于名称的相似度（编辑距离、余弦相似度）
  - 基于使用模式的相似度（共现频率）
  - 综合相似度评分

- [ ] **实现标签合并逻辑**
  - 选择保留的标签（使用次数更多）
  - 更新所有引用
  - 记录演化日志

- [ ] **实现标签分裂逻辑**
  - 识别可分裂的热门标签
  - 生成子标签建议
  - 需要管理员确认

### 3.3 标签淘汰服务

- [ ] **创建 TagRetirementService**
  - 文件：`hotnews/kernel/services/tag_retirement_service.py`
  - 实现 get_obsolete_tags() - 获取过时标签
  - 实现 archive_tag() - 归档标签
  - 实现 calculate_tag_health() - 计算标签健康度

- [ ] **实现淘汰规则**
  - 过时标签：长期未使用
  - 低质量标签：使用次数少、置信度低
  - 重复标签：自动合并

- [ ] **实现归档流程**
  - 标记为 archived
  - 保留历史数据
  - 记录演化日志

### 3.4 测试

- [ ] **单元测试**
  - 文件：`tests/test_tag_validation.py`
  - 测试晋升条件检查
  - 测试质量分数计算

- [ ] **单元测试**
  - 文件：`tests/test_tag_evolution.py`
  - 测试标签合并
  - 测试标签分裂
  - 测试标签升级/降级

- [ ] **单元测试**
  - 文件：`tests/test_tag_retirement.py`
  - 测试过时标签识别
  - 测试归档流程

## 📊 Phase 4: 监控与管理（1 天）

### 4.1 Admin API

- [ ] **候选标签管理 API**
  - 文件：`hotnews/kernel/admin/tag_candidate_admin.py`
  - GET /api/admin/tags/candidates - 列表
  - GET /api/admin/tags/candidates/{tag_id} - 详情
  - POST /api/admin/tags/candidates/{tag_id}/approve - 批准
  - POST /api/admin/tags/candidates/{tag_id}/reject - 拒绝
  - POST /api/admin/tags/candidates - 创建

- [ ] **标签演化 API**
  - 文件：`hotnews/kernel/admin/tag_evolution_admin.py`
  - GET /api/admin/tags/evolution/logs - 演化日志
  - POST /api/admin/tags/evolution/merge - 合并标签
  - POST /api/admin/tags/evolution/split - 分裂标签
  - POST /api/admin/tags/evolution/change-type - 升级/降级

- [ ] **标签统计 API**
  - 文件：`hotnews/kernel/admin/tag_stats_admin.py`
  - GET /api/admin/tags/health - 健康度报告
  - GET /api/admin/tags/trends - 趋势分析
  - GET /api/admin/tags/candidates/stats - 候选标签统计

### 4.2 Admin 界面

- [ ] **候选标签管理页面**
  - 文件：`hotnews/kernel/templates/admin_tag_candidates.html`
  - 显示候选标签列表
  - 支持批准/拒绝操作
  - 显示统计信息（出现次数、置信度）

- [ ] **标签演化日志页面**
  - 文件：`hotnews/kernel/templates/admin_tag_evolution.html`
  - 显示演化历史
  - 支持按标签、动作类型筛选
  - 时间线视图

- [ ] **标签健康度仪表板**
  - 文件：`hotnews/kernel/templates/admin_tag_health.html`
  - 显示标签统计
  - 显示趋势图表
  - 显示预警信息（过时标签、低质量标签）

### 4.3 定时任务

- [ ] **创建标签演化调度器**
  - 文件：`hotnews/kernel/scheduler/tag_evolution_scheduler.py`
  - 实现 TagEvolutionScheduler 类
  - 每小时任务：晋升候选标签
  - 每日任务：标签演化、清理低质量标签
  - 每周任务：淘汰过时标签、生成报告

- [ ] **集成到主调度器**
  - 文件：`hotnews/kernel/scheduler/__init__.py`
  - 启动标签演化调度器
  - 确保与其他任务不冲突

### 4.4 监控与日志

- [ ] **添加日志记录**
  - 所有关键操作记录日志
  - 包含详细的上下文信息
  - 错误日志包含堆栈跟踪

- [ ] **添加性能监控**
  - 记录任务执行时间
  - 记录 API 响应时间
  - 记录数据库查询性能

### 4.5 测试

- [ ] **API 测试**
  - 文件：`tests/test_tag_admin_api.py`
  - 测试所有 Admin API 端点
  - 测试权限控制

- [ ] **E2E 测试**
  - 文件：`tests/e2e/tag-evolution.spec.ts`
  - 测试完整的标签演化流程
  - 从发现到晋升到淘汰

## 📚 Phase 5: 文档与部署（0.5 天）

### 5.1 文档

- [ ] **用户文档**
  - 文件：`docs/guides/tag-evolution.md`
  - 系统概述
  - 使用指南
  - 常见问题

- [ ] **API 文档**
  - 文件：`docs/api/tag-evolution-api.md`
  - 所有 API 端点说明
  - 请求/响应示例
  - 错误码说明

- [ ] **运维文档**
  - 文件：`docs/ops/tag-evolution-ops.md`
  - 部署步骤
  - 配置说明
  - 故障排查

### 5.2 配置

- [ ] **添加配置项**
  - 文件：`config/config.yaml`
  - 晋升条件配置
  - 演化规则配置
  - 淘汰规则配置
  - 定时任务配置

- [ ] **环境变量**
  - 文件：`docker/.env.example`
  - TAG_EVOLUTION_ENABLED - 是否启用标签演化
  - TAG_PROMOTION_MIN_OCCURRENCE - 最小出现次数
  - TAG_PROMOTION_MIN_CONFIDENCE - 最小置信度
  - TAG_EVOLUTION_SCHEDULE - 定时任务执行时间

### 5.3 部署

- [ ] **数据库迁移**
  - 在生产环境执行迁移脚本
  - 备份现有数据
  - 验证迁移结果

- [ ] **代码部署**
  - 部署新代码
  - 重启服务
  - 验证功能正常

- [ ] **监控配置**
  - 配置日志收集
  - 配置告警规则
  - 配置性能监控

## ✅ 验收标准

### 功能验收

- [ ] AI 能够从新闻中提取新标签
- [ ] 新标签正确保存到候选池
- [ ] 候选标签能够自动晋升为正式标签
- [ ] 标签能够合并、分裂、升级、降级
- [ ] 过时标签能够自动归档
- [ ] Admin 界面能够管理候选标签
- [ ] 演化日志正确记录所有操作

### 性能验收

- [ ] AI 标注性能无明显下降（< 10% 延迟增加）
- [ ] 定时任务不影响主服务性能
- [ ] 数据库查询性能良好（< 100ms）

### 质量验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 所有 E2E 测试通过
- [ ] 代码审查通过
- [ ] 文档完整

## 📝 注意事项

1. **向后兼容**：确保现有标签系统继续正常工作
2. **数据安全**：所有数据库操作需要事务保护
3. **性能优化**：避免在主流程中执行耗时操作
4. **错误处理**：所有异常需要妥善处理和记录
5. **配置化**：所有阈值和规则需要可配置
6. **可观测性**：添加足够的日志和监控指标

---

**创建时间**: 2026-01-19  
**最后更新**: 2026-01-19  
**预计完成时间**: 2026-01-24
