import { test, expect, chromium, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 使用 Chrome 扩展进行发布测试
 */

const EXTENSION_PATH = path.resolve(__dirname, '../../../hotnews-summarizer');

test.describe('Publish with extension', () => {
  
  test('publish and check result details', async () => {
    // 检查扩展目录是否存在
    if (!fs.existsSync(EXTENSION_PATH)) {
      console.log('⚠️ 扩展目录不存在:', EXTENSION_PATH);
      test.skip();
      return;
    }
    
    console.log('加载扩展:', EXTENSION_PATH);
    
    // 使用 chromium 启动并加载扩展
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--disable-blink-features=AutomationControlled',
      ],
      timeout: 60000,
    });
    
    const page = await context.newPage();
    
    // 收集所有控制台消息
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      console.log('  [Browser]', text);
    });
    
    try {
      // 等待扩展加载
      await page.waitForTimeout(3000);
      
      // 1. 打开编辑器
      await page.goto('http://127.0.0.1:8090/write');
      await page.waitForSelector('#editor .ProseMirror', { timeout: 15000 });
      console.log('✅ 编辑器加载成功');
      
      // 2. 输入标题
      const title = 'Playwright 测试文章 - ' + new Date().toLocaleString('zh-CN');
      await page.locator('#title').fill(title);
      console.log('✅ 标题已输入:', title);
      
      // 3. 输入内容
      const editor = page.locator('#editor .ProseMirror');
      await editor.click();
      await page.keyboard.type('这是测试内容。\n\n第二段内容。');
      console.log('✅ 内容已输入');
      
      // 4. 点击发布按钮
      await page.click('#btn-publish');
      await expect(page.locator('#publish-modal')).toBeVisible({ timeout: 10000 });
      console.log('✅ 发布弹窗已显示');
      
      // 5. 等待登录状态检测
      await page.waitForTimeout(5000);
      
      // 6. 选择知乎
      await page.locator('[data-platform="zhihu"] input[type="checkbox"]').check();
      console.log('✅ 已选择知乎');
      
      // 7. 点击确认发布
      await page.locator('#btn-confirm-publish').click();
      console.log('✅ 点击确认发布');
      
      // 8. 等待发布完成
      await page.waitForTimeout(15000);
      
      // 9. 检查结果弹窗
      const resultModal = page.locator('#result-modal');
      const isResultVisible = await resultModal.isVisible();
      console.log('\n=== 发布结果 ===');
      console.log('结果弹窗是否显示:', isResultVisible);
      
      if (isResultVisible) {
        // 获取结果详情
        const summary = await page.locator('#result-summary').innerHTML();
        console.log('结果摘要 HTML:', summary);
        
        const resultList = await page.locator('#result-list').innerHTML();
        console.log('结果列表 HTML:', resultList);
        
        // 检查是否有链接
        const links = await page.locator('#result-list a').all();
        console.log('链接数量:', links.length);
        for (const link of links) {
          const href = await link.getAttribute('href');
          const text = await link.textContent();
          console.log('  链接:', text, '->', href);
        }
      }
      
      // 10. 打印所有控制台日志中的发布相关信息
      console.log('\n=== 发布相关日志 ===');
      for (const log of consoleLogs) {
        if (log.includes('发布') || log.includes('Publish') || log.includes('zhihu') || log.includes('知乎')) {
          console.log(log);
        }
      }
      
      // 截图
      await page.screenshot({ path: 'test-results/publish-result-detail.png', fullPage: true });
      
      // 保持打开
      await page.waitForTimeout(10000);
      
    } catch (error) {
      console.error('测试失败:', error);
      console.log('\n=== 所有控制台日志 ===');
      for (const log of consoleLogs) {
        console.log(log);
      }
      await page.screenshot({ path: 'test-results/publish-error-detail.png', fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  });
});
