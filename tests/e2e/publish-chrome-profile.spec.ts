import { test, expect, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const EXTENSION_PATH = path.resolve(__dirname, '../../../hotnews-summarizer');
const CHROME_USER_DATA = process.env.HOME + '/Library/Application Support/Google/Chrome';
const TEST_USER_DATA = path.resolve(__dirname, '.chrome-test-profile');

/**
 * 使用复制的 Chrome cookies 进行发布测试
 */
test('publish with copied Chrome cookies', async () => {
  // 复制 Chrome 的 Cookies 文件到测试目录
  const srcCookies = path.join(CHROME_USER_DATA, 'Default', 'Cookies');
  const destDir = path.join(TEST_USER_DATA, 'Default');
  const destCookies = path.join(destDir, 'Cookies');
  
  // 创建目录
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // 复制 Cookies 文件
  if (fs.existsSync(srcCookies)) {
    fs.copyFileSync(srcCookies, destCookies);
    console.log('✅ Cookies 已复制');
  } else {
    console.log('⚠️ 未找到 Chrome Cookies 文件');
  }
  
  // 复制 Local State 文件（包含加密密钥）
  const srcLocalState = path.join(CHROME_USER_DATA, 'Local State');
  const destLocalState = path.join(TEST_USER_DATA, 'Local State');
  if (fs.existsSync(srcLocalState)) {
    fs.copyFileSync(srcLocalState, destLocalState);
    console.log('✅ Local State 已复制');
  }
  
  console.log('使用测试目录:', TEST_USER_DATA);
  console.log('加载扩展:', EXTENSION_PATH);
  
  const context = await chromium.launchPersistentContext(TEST_USER_DATA, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
    timeout: 60000,
  });
  
  const page = await context.newPage();
  
  // 监听控制台
  page.on('console', msg => {
    console.log('[Browser]', msg.text());
  });
  
  try {
    await page.waitForTimeout(3000);
    
    // 打开编辑器
    await page.goto('http://127.0.0.1:8090/write');
    await page.waitForSelector('#editor .ProseMirror', { timeout: 15000 });
    console.log('✅ 编辑器加载成功');
    
    // 输入标题和内容
    const title = '自动化发布测试 - ' + new Date().toLocaleString('zh-CN');
    await page.locator('#title').fill(title);
    console.log('✅ 标题:', title);
    
    const editor = page.locator('#editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('这是自动化测试的文章内容。\n\n第二段。');
    console.log('✅ 内容已输入');
    
    // 点击发布
    await page.click('#btn-publish');
    await expect(page.locator('#publish-modal')).toBeVisible({ timeout: 10000 });
    console.log('✅ 发布弹窗已显示');
    
    // 等待登录状态检测
    await page.waitForTimeout(5000);
    
    // 打印登录状态
    console.log('\n=== 平台登录状态 ===');
    for (const platform of ['zhihu', 'juejin', 'csdn', 'weixin']) {
      const status = await page.locator(`[data-platform="${platform}"] .login-status`).textContent();
      console.log(`${platform}: ${status}`);
    }
    
    // 选择知乎
    await page.locator('[data-platform="zhihu"] input').check();
    console.log('\n✅ 已选择知乎');
    
    // 点击确认发布
    await page.locator('#btn-confirm-publish').click();
    console.log('✅ 开始发布...');
    
    // 等待结果
    await page.waitForTimeout(20000);
    
    // 检查结果弹窗
    const resultModal = page.locator('#result-modal');
    if (await resultModal.isVisible()) {
      console.log('\n=== 发布结果 ===');
      const summary = await page.locator('#result-summary').textContent();
      console.log('摘要:', summary);
      
      const resultHtml = await page.locator('#result-list').innerHTML();
      console.log('详情 HTML:', resultHtml);
      
      // 检查链接
      const links = await page.locator('#result-list a').all();
      console.log('链接数量:', links.length);
      for (const link of links) {
        const href = await link.getAttribute('href');
        console.log('  ->', href);
      }
    } else {
      console.log('⚠️ 结果弹窗未显示');
    }
    
    await page.screenshot({ path: 'test-results/chrome-profile-publish.png', fullPage: true });
    
    // 保持打开 10 秒
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('测试失败:', error);
    await page.screenshot({ path: 'test-results/chrome-profile-error.png', fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
});
