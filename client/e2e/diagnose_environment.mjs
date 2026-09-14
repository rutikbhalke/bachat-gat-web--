import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import os from 'os';

async function diagnose() {
  console.log('================================================================================');
  console.log('ENVIRONMENT & SESSION DIAGNOSIS FOR CHROMIUM GUI WINDOW');
  console.log('================================================================================');

  // 1. Host & User Info
  console.log(`OS Platform: ${os.platform()} (${os.release()})`);
  console.log(`User Info: ${JSON.stringify(os.userInfo().username)}`);

  try {
    const whoami = execSync('whoami').toString().trim();
    console.log(`whoami: ${whoami}`);
  } catch (e) {
    console.log(`whoami error: ${e.message}`);
  }

  // 2. Windows Session Info (qwinsta / query session)
  try {
    const sessions = execSync('qwinsta').toString().trim();
    console.log('\n--- ACTIVE WINDOWS SESSIONS (qwinsta) ---');
    console.log(sessions);
  } catch (e) {
    console.log('qwinsta unavailable or non-interactive');
  }

  // 3. Launch Chromium
  const executablePath = chromium.executablePath();
  console.log(`\nChromium Executable Path: ${executablePath}`);

  let browser;
  try {
    console.log('\nLaunching Playwright Chromium (headless: false)...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 1000,
      args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.goto('http://localhost:3000');

    // 4. Inspect running Chrome processes and their Session IDs
    try {
      const tasklist = execSync('tasklist /v /fi "IMAGENAME eq chrome.exe" /fo list').toString();
      console.log('\n--- CHROME / CHROMIUM PROCESSES & SESSION ASSIGNMENTS ---');
      console.log(tasklist || 'No chrome.exe found (checking chromium)');
    } catch (e) {
      console.log(`tasklist error: ${e.message}`);
    }

    try {
      const tasklistChromium = execSync('tasklist /v /fi "IMAGENAME eq chromium.exe" /fo list').toString();
      if (tasklistChromium.includes('PID')) {
        console.log('\n--- CHROMIUM PROCESSES ---');
        console.log(tasklistChromium);
      }
    } catch (e) {}

    console.log('\nKeeping browser alive for 60 seconds for live inspection...');
    for (let i = 60; i > 0; i -= 10) {
      console.log(`Diagnostic timer: ${i}s remaining...`);
      await page.waitForTimeout(10000);
    }
  } catch (err) {
    console.error('Launch failed:', err);
  } finally {
    if (browser) await browser.close();
  }
}

diagnose();
