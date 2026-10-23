import fs from 'node:fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
import { chromium, webkit } from 'playwright';
import { adminToken, ADMIN_COOKIE } from '../lib/auth.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = 'playwright-screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const DEVICES = [
  { name: 'iPhone SE', engine: 'webkit', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'iPhone 14', engine: 'webkit', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'iPhone 14 Pro Max', engine: 'webkit', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: 'Pixel 7', engine: 'chromium', width: 412, height: 915, isMobile: true, hasTouch: true },
  { name: 'Galaxy S9', engine: 'chromium', width: 360, height: 740, isMobile: true, hasTouch: true },
  { name: 'iPad', engine: 'webkit', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'Desktop 1280x800', engine: 'chromium', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'Desktop 1440x900', engine: 'chromium', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'iPhone 14 Landscape', engine: 'webkit', width: 844, height: 390, isMobile: true, hasTouch: true },
];

async function runAudit() {
  console.log('=== STARTING PLAYWRIGHT FRONTEND AUDIT ===');
  const token = adminToken();
  const reports = [];

  for (const dev of DEVICES) {
    console.log(`\n--- Testing on ${dev.name} (${dev.engine}, ${dev.width}x${dev.height}) ---`);
    const browserType = dev.engine === 'webkit' ? webkit : chromium;
    const browser = await browserType.launch({ headless: true });
    
    // Context with admin cookie preloaded
    const context = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      isMobile: dev.isMobile,
      hasTouch: dev.hasTouch,
    });

    await context.addCookies([
      {
        name: ADMIN_COOKIE,
        value: token,
        domain: 'localhost',
        path: '/',
      },
    ]);

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    const devSlug = dev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // 1. Home Page /
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const homeAudit = await auditPage(page, `${dev.name} - Home`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-home.png`, fullPage: false });
    reports.push(homeAudit);

    // Search on Home Page
    const searchInput = page.locator('#find');
    if (await searchInput.isVisible()) {
      await searchInput.fill('patel');
      await page.waitForTimeout(400);
      const searchAudit = await auditPage(page, `${dev.name} - Home Search Results`);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-home-search.png` });
      reports.push(searchAudit);
    }

    // 2. Group 1
    await page.goto(`${BASE_URL}/group/1`, { waitUntil: 'networkidle' });
    const group1Audit = await auditPage(page, `${dev.name} - Group 1`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-group1.png` });
    reports.push(group1Audit);

    // 3. Group 12 (or fallback group)
    const g12Res = await page.goto(`${BASE_URL}/group/12`, { waitUntil: 'networkidle' });
    if (g12Res.status() === 200) {
      const group12Audit = await auditPage(page, `${dev.name} - Group 12`);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-group12.png` });
      reports.push(group12Audit);
    }

    // 4. Admin Dashboard
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    const adminAudit = await auditPage(page, `${dev.name} - Admin Dashboard`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-admin.png`, fullPage: false });
    reports.push(adminAudit);

    // Trigger Delete Dialog on Admin
    const deleteBtn = page.locator('.btn-delete').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(300);
      const dialogAudit = await auditPage(page, `${dev.name} - Delete Dialog`);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-admin-delete-dialog.png` });
      reports.push(dialogAudit);
      // Cancel dialog
      const cancelBtn = page.locator('.modal-dialog button:text("Cancel")');
      if (await cancelBtn.isVisible()) await cancelBtn.click();
    }

    // 5. Admin Login (unauthenticated)
    const unauthContext = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      isMobile: dev.isMobile,
      hasTouch: dev.hasTouch,
    });
    const unauthPage = await unauthContext.newPage();
    await unauthPage.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
    const loginAudit = await auditPage(unauthPage, `${dev.name} - Admin Login`);
    await unauthPage.screenshot({ path: `${SCREENSHOT_DIR}/${devSlug}-admin-login.png` });
    reports.push(loginAudit);
    await unauthContext.close();

    if (consoleErrors.length > 0) {
      console.warn(`[${dev.name}] Console errors:`, consoleErrors);
    }

    await context.close();
    await browser.close();
  }

  // Summary Report
  console.log('\n================ AUDIT SUMMARY REPORT ================');
  let totalIssues = 0;
  for (const r of reports) {
    const issuesCount = r.scrollOverflows.length + r.tapTargetIssues.length + r.clippedElements.length;
    totalIssues += issuesCount;
    if (issuesCount > 0) {
      console.log(`\n❌ ${r.pageTitle}:`);
      if (r.scrollOverflows.length) {
        console.log(`   - Horizontal Page Scroll: document.scrollWidth=${r.scrollWidth} > innerWidth=${r.innerWidth} (overflow: ${r.scrollWidth - r.innerWidth}px)`);
      }
      if (r.clippedElements.length) {
        console.log(`   - Clipped/Overflowing Elements (${r.clippedElements.length}):`);
        r.clippedElements.slice(0, 5).forEach(c => console.log(`      * <${c.tag}> ${c.id || c.className || ''} right=${c.right} (viewport=${r.innerWidth})`));
      }
      if (r.tapTargetIssues.length) {
        console.log(`   - Small Tap Targets (<44x44px) (${r.tapTargetIssues.length}):`);
        r.tapTargetIssues.slice(0, 8).forEach(t => console.log(`      * <${t.tag}> "${t.text.slice(0, 25)}" (${t.width}x${t.height}px) [${t.selector}]`));
      }
      if (r.smallTextIssues.length) {
        console.log(`   - Text < 14px (${r.smallTextIssues.length} elements, smallest: ${r.smallTextIssues[0]?.fontSize}):`);
        r.smallTextIssues.slice(0, 3).forEach(s => console.log(`      * "${s.text.slice(0, 30)}" (${s.fontSize})`));
      }
    } else {
      console.log(`✓ ${r.pageTitle}: OK`);
    }
  }

  console.log(`\nTotal responsive/UI issues detected: ${totalIssues}`);
}

async function auditPage(page, pageTitle) {
  return await page.evaluate((title) => {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const scrollOverflows = [];
    if (scrollWidth > innerWidth) {
      scrollOverflows.push({ scrollWidth, innerWidth });
    }

    // Find overflowing elements
    const clippedElements = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      // Exclude hidden elements or overlay elements
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > innerWidth + 1.5 && !el.classList.contains('modal-overlay')) {
        clippedElements.push({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: typeof el.className === 'string' ? el.className : '',
          right: Math.round(rect.right),
          text: (el.textContent || '').trim().slice(0, 30),
        });
      }
    }

    // Check tap targets for interactive elements
    const tapTargetIssues = [];
    const interactive = document.querySelectorAll('button, a, select, input[type="search"], input[type="date"], input[type="text"], input[type="password"], .btn, .yrow');
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip hidden or nested within another interactive
      if (window.getComputedStyle(el).display === 'none') continue;
      if (window.getComputedStyle(el).visibility === 'hidden') continue;

      if (rect.width < 44 || rect.height < 44) {
        tapTargetIssues.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          selector: el.className || el.id || el.tagName.toLowerCase(),
        });
      }
    }

    // Check text size < 14px
    const smallTextIssues = [];
    const textElements = document.querySelectorAll('p, span, a, td, th, label, div, strong, b');
    for (const el of textElements) {
      if (el.children.length === 0 && el.textContent && el.textContent.trim().length > 0) {
        const fs = window.getComputedStyle(el).fontSize;
        const px = parseFloat(fs);
        if (px < 13.5) { // allow 13.5-14 rounding
          smallTextIssues.push({
            fontSize: fs,
            text: el.textContent.trim().slice(0, 40),
            tag: el.tagName.toLowerCase(),
          });
        }
      }
    }

    return {
      pageTitle: title,
      innerWidth,
      innerHeight,
      scrollWidth,
      scrollOverflows,
      clippedElements,
      tapTargetIssues,
      smallTextIssues,
    };
  }, pageTitle);
}

runAudit().catch(console.error);
