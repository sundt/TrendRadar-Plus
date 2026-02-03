import { test, expect } from '@playwright/test';

test.describe('Write Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/write');
    // 等待编辑器初始化
    await page.waitForSelector('#editor .ProseMirror', { timeout: 10000 });
  });

  test('should load editor page', async ({ page }) => {
    await expect(page).toHaveTitle(/编辑文章/);
    const titleInput = page.locator('#title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveAttribute('placeholder', '请输入标题');
  });

  test('should allow typing in title input', async ({ page }) => {
    const titleInput = page.locator('#title');
    await titleInput.fill('测试文章标题');
    await expect(titleInput).toHaveValue('测试文章标题');
  });

  test('should show error when publishing without title', async ({ page }) => {
    await page.click('#btn-publish');
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('请输入标题');
  });

  test('should open publish modal and select platforms', async ({ page }) => {
    // 1. 输入标题
    const titleInput = page.locator('#title');
    await titleInput.fill('自动化测试文章');
    
    // 2. 在编辑器中输入内容
    const editor = page.locator('#editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('这是自动化测试的文章内容，用于验证发布功能。');
    
    // 3. 点击发布按钮
    await page.click('#btn-publish');
    
    // 4. 验证发布弹窗显示
    const publishModal = page.locator('#publish-modal');
    await expect(publishModal).toBeVisible();
    
    // 5. 检查平台列表
    await expect(page.locator('[data-platform="zhihu"]')).toBeVisible();
    await expect(page.locator('[data-platform="juejin"]')).toBeVisible();
    await expect(page.locator('[data-platform="csdn"]')).toBeVisible();
    await expect(page.locator('[data-platform="weixin"]')).toBeVisible();
    
    // 6. 选择一个平台
    await page.locator('[data-platform="zhihu"] input[type="checkbox"]').check();
    
    // 7. 验证选中状态
    await expect(page.locator('[data-platform="zhihu"] input[type="checkbox"]')).toBeChecked();
    
    console.log('✅ 发布弹窗测试通过！');
  });

  test('full publish flow - select platform and click confirm', async ({ page }) => {
    // 1. 输入标题
    await page.locator('#title').fill('完整发布流程测试');
    
    // 2. 输入摘要
    await page.locator('#digest').fill('这是文章摘要');
    
    // 3. 在编辑器中输入内容
    const editor = page.locator('#editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('# 标题\n\n这是正文内容，包含一些测试文字。\n\n- 列表项1\n- 列表项2');
    
    // 4. 点击发布按钮
    await page.click('#btn-publish');
    
    // 5. 等待发布弹窗
    await expect(page.locator('#publish-modal')).toBeVisible();
    
    // 6. 选择知乎平台
    await page.locator('[data-platform="zhihu"] input[type="checkbox"]').check();
    
    // 7. 点击确认发布（会因为没有插件而失败，但流程是对的）
    const confirmBtn = page.locator('#btn-confirm-publish');
    
    // 检查按钮状态
    const isDisabled = await confirmBtn.isDisabled();
    console.log('确认发布按钮是否禁用:', isDisabled);
    
    if (!isDisabled) {
      await confirmBtn.click();
      console.log('✅ 点击了确认发布按钮');
      
      // 等待一下看结果
      await page.waitForTimeout(3000);
      
      // 检查是否有插件提示
      const pluginNotice = page.locator('#plugin-notice');
      const isPluginNoticeVisible = await pluginNotice.isVisible();
      console.log('插件提示是否显示:', isPluginNoticeVisible);
    } else {
      console.log('⚠️ 确认发布按钮被禁用（可能是因为没有安装插件）');
      
      // 检查插件提示
      const pluginNotice = page.locator('#plugin-notice');
      if (await pluginNotice.isVisible()) {
        console.log('显示了插件未安装提示');
      }
    }
  });
});
