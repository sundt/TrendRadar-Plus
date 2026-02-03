import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../../../hotnews-summarizer');
const AUTH_DIR = path.resolve(__dirname, '.auth');

/**
 * 步骤1：先运行这个测试登录各平台
 * 会打开浏览器让你手动登录，然后保存登录状态
 */
test('step1: login to platforms manually', async () => {
  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
    timeout: 120000,
  });
  
  const page = await context.newPage();
  
  console.log('\n========================================');
  console.log('请在浏览器中登录以下平台：');
  console.log('1. 知乎: https://www.zhihu.com');
  console.log('2. 掘金: https://juejin.cn');
  console.log('3. 微信公众号: https://mp.weixin.qq.com');
  console.log('========================================\n');
  
  // 打开知乎
  await page.goto('https://www.zhihu.com');
  
  console.log('登录完成后，测试会在 2 分钟后自动结束');
  console.log('或者你可以手动关闭浏览器窗口\n');
  
  // 等待 2 分钟让用户登录
  await page.waitForTimeout(120000);
  
  await context.close();
  console.log('✅ 登录状态已保存到:', AUTH_DIR);
});

/**
 * 步骤2：使用保存的登录状态发布
 */
test('step2: publish with saved login', async () => {
  // 检查是否有保存的登录状态
  if (!fs.existsSync(AUTH_DIR)) {
    console.log('⚠️ 请先运行 step1 登录各平台');
    test.skip();
    return;
  }
  
  const context = await chromium.launchPersistentContext(AUTH_DIR, {
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
    await page.waitForTimeout(2000);
    
    // 打开编辑器
    await page.goto('http://127.0.0.1:8090/write');
    await page.waitForSelector('#editor .ProseMirror', { timeout: 15000 });
    console.log('✅ 编辑器加载成功');
    
    // 输入标题和内容
    await page.locator('#title').fill('自动化发布测试 - ' + new Date().toLocaleString('zh-CN'));
    const editor = page.locator('#editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('这是自动化测试的文章内容。');
    
    // 点击发布
    await page.click('#btn-publish');
    await expect(page.locator('#publish-modal')).toBeVisible({ timeout: 10000 });
    
    // 等待登录状态检测
    await page.waitForTimeout(5000);
    
    // 打印登录状态
    console.log('\n=== 平台登录状态 ===');
    for (const platform of ['zhihu', 'juejin', 'csdn', 'weixin']) {
      const status = await page.locator(`[data-platform="${platform}"] .login-status`).textContent();
      console.log(`${platform}: ${status}`);
    }
    
    // 选择知乎并发布
    await page.locator('[data-platform="zhihu"] input').check();
    await page.locator('#btn-confirm-publish').click();
    console.log('✅ 开始发布...');
    
    // 等待结果
    await page.waitForTimeout(20000);
    
    // 检查结果
    const resultModal = page.locator('#result-modal');
    if (await resultModal.isVisible()) {
      const summary = await page.locator('#result-summary').textContent();
      console.log('\n=== 发布结果 ===');
      console.log(summary);
      
      // 检查链接
      const links = await page.locator('#result-list a').all();
      for (const link of links) {
        console.log('链接:', await link.getAttribute('href'));
      }
    }
    
    await page.screenshot({ path: 'test-results/publish-with-login.png' });
    await page.waitForTimeout(5000);
    
  } finally {
    await context.close();
  }
});
