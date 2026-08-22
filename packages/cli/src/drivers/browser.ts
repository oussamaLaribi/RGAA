import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright';
import {
  collectAxeResults,
  SOURCE_ATTRIBUTE,
  type RawAxeReport,
  type RawCustomReport,
} from '@rgaa-source/core';

const require = createRequire(import.meta.url);

/** Bundled, self-contained axe build meant to be dropped into a page. */
const AXE_SCRIPT_PATH = require.resolve('axe-core/axe.min.js');

/**
 * Our own rules, bundled the same way and dropped in beside axe.
 *
 * Resolved through the package's entry point so it follows the workspace link
 * rather than a path relative to this file, which differs between the source
 * tree and an installed copy.
 */
const RULES_SCRIPT_PATH = require
  .resolve('@rgaa-source/core')
  .replace(/index\.js$/, 'rules.bundle.js');

export interface ScanOptions {
  /**
   * Playwright channel. Defaults to the Edge that ships with Windows so a first
   * run does not have to download a browser.
   */
  channel?: string;
  violationsOnly?: boolean;
  timeoutMs?: number;
  /** axe locale object, applied in the page before the run. */
  locale?: unknown;
  /** Wording for our own rules, applied in the page before they run. */
  ruleLocale?: unknown;
}

export interface PageReport {
  axe: RawAxeReport;
  custom: RawCustomReport;
}

export interface BrowserSession {
  scan(url: string): Promise<PageReport>;
  close(): Promise<void>;
}

/**
 * axe only sees a frame it has been loaded into, so it goes into every one.
 * A frame can vanish mid-navigation; that is not a scan failure.
 */
async function injectAxe(page: Page): Promise<void> {
  await Promise.all(
    page.frames().map(async (frame) => {
      try {
        await frame.addScriptTag({ path: AXE_SCRIPT_PATH });
        await frame.addScriptTag({ path: RULES_SCRIPT_PATH });
      } catch {
        /* frame detached or refused the script; its results are simply absent */
      }
    }),
  );
}

export async function openBrowser(options: ScanOptions = {}): Promise<BrowserSession> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: options.channel ?? 'msedge' });
  } catch (error) {
    // A missing channel is the common first-run failure and the message from
    // Playwright is long; say what to do about it instead.
    throw new Error(
      `could not launch ${options.channel ?? 'msedge'}. Install it, or pass --browser chromium ` +
        `after running "npx playwright install chromium".\n${(error as Error).message}`,
    );
  }

  const context = await browser.newContext();
  const timeout = options.timeoutMs ?? 30_000;
  context.setDefaultTimeout(timeout);

  return {
    async scan(url: string): Promise<PageReport> {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await injectAxe(page);
        const axe = await page.evaluate(collectAxeResults, {
          sourceAttribute: SOURCE_ATTRIBUTE,
          violationsOnly: options.violationsOnly ?? false,
          ...(options.locale ? { locale: options.locale } : {}),
        });

        // The bundle exposes a global rather than being serialised, so it is
        // called by name; a page that blocked the script yields no results
        // instead of failing the whole scan.
        const custom = await page.evaluate(([attribute, ruleLocale]: [string, unknown]) => {
          const runner = (globalThis as unknown as Record<string, { run?: unknown }>)[
            '__rgaaRules'
          ];
          const run = runner?.run as
            | ((value: string, locale?: unknown) => unknown)
            | undefined;
          return run
            ? (run(attribute, ruleLocale) as RawCustomReport)
            : { results: [], errors: [{ ruleId: 'all', message: 'rules bundle not present' }] };
        }, [SOURCE_ATTRIBUTE, options.ruleLocale ?? null] as [string, unknown]);

        return { axe, custom };
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      await browser.close();
    },
  };
}
