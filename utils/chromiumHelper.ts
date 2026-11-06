// utils/chromiumHelper.ts
import fs from 'fs';
import path from 'path';

/**
 * Ensures Playwright can find the installed Chromium headless shell,
 * even if the installed directory revision does not match playwright's default browsers.json revision.
 */
export function ensurePlaywrightBrowserLinks(): void {
  try {
    if (!fs.existsSync('/ms-playwright')) return;
    const entries = fs.readdirSync('/ms-playwright');
    const installedHeadless = entries.find(e => e.startsWith('chromium_headless_shell-') && !e.includes('1228'));
    if (installedHeadless && !fs.existsSync('/ms-playwright/chromium_headless_shell-1228')) {
      const target = path.join('/ms-playwright', installedHeadless);
      fs.symlinkSync(target, '/ms-playwright/chromium_headless_shell-1228');
      console.log(`[Playwright Init] Linked /ms-playwright/chromium_headless_shell-1228 -> ${target}`);
    }
  } catch (err: any) {
    console.warn('[Playwright Init] Symlink check skipped:', err?.message);
  }
}

/**
 * Returns resilient launch options for Playwright Chromium, with explicit executablePath
 * fallback to ensure it works across various container environments.
 */
export function getChromiumLaunchOptions(extraArgs: string[] = []): {
  headless: boolean;
  args: string[];
  executablePath?: string;
} {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--font-render-hinting=none',
    ...extraArgs,
  ];

  // 1. Explicit override via environment variables
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) {
    return { headless: true, args, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH };
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return { headless: true, args, executablePath: process.env.CHROME_BIN };
  }

  // 2. Direct symlink in /ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell
  const defaultShellLink = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
  if (fs.existsSync(defaultShellLink)) {
    return { headless: true, args, executablePath: defaultShellLink };
  }

  // 3. Scan /ms-playwright for any available chromium_headless_shell or chromium
  if (fs.existsSync('/ms-playwright')) {
    try {
      const dirs = fs.readdirSync('/ms-playwright');
      for (const dir of dirs) {
        if (dir.startsWith('chromium_headless_shell-') || dir.startsWith('chromium-')) {
          const candidate1 = path.join('/ms-playwright', dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
          if (fs.existsSync(candidate1)) {
            return { headless: true, args, executablePath: candidate1 };
          }
          const candidate2 = path.join('/ms-playwright', dir, 'chrome-linux', 'chrome');
          if (fs.existsSync(candidate2)) {
            return { headless: true, args, executablePath: candidate2 };
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Standard Linux browser paths
  const standardPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return { headless: true, args, executablePath: p };
  }

  return { headless: true, args };
}
