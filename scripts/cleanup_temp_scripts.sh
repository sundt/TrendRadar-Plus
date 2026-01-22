#!/bin/bash
# 清理项目中的临时测试脚本
# 用于在开发过程中定期清理遗留的调试文件

set -e

PROJECT_ROOT="/Users/sun/Downloads/hotnews"
cd "$PROJECT_ROOT"

echo "🔍 检查项目根目录的临时脚本..."
echo ""

# 查找匹配的临时文件
TEMP_FILES=$(find . -maxdepth 1 -type f \( -name "debug_*.py" -o -name "scrape_*.py" -o -name "test_*.py" \) 2>/dev/null)

if [ -z "$TEMP_FILES" ]; then
    echo "✅ 未发现临时脚本"
    exit 0
fi

echo "⚠️  发现以下临时脚本："
echo "$TEMP_FILES" | while read -r file; do
    # 显示文件信息
    size=$(ls -lh "$file" | awk '{print $5}')
    modified=$(ls -l "$file" | awk '{print $6, $7, $8}')
    echo "  - $file (大小: $size, 修改时间: $modified)"
done

echo ""
echo "这些文件通常是测试时创建的，可以安全删除。"
echo ""
read -p "是否删除这些文件？(y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$TEMP_FILES" | while read -r file; do
        rm "$file"
        echo "  ✓ 已删除: $file"
    done
    echo ""
    echo "✅ 清理完成！"
else
    echo "❌ 已取消删除"
    exit 1
fi
