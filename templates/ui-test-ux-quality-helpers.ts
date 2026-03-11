/**
 * UI Test UX Quality Helpers
 *
 * Test helpers for quality-beyond-correctness testing. These helpers catch
 * visual glitches, performance issues, and intermediate bad states that
 * standard E2E tests miss.
 *
 * Copy this file to your project: e2e/helpers/ui-test-ux-quality-helpers.ts
 */

import { Page, Locator, expect } from '@playwright/test';

/**
 * Assert that a selector NEVER matches any elements during an operation.
 * Use this to catch intermediate bad states (e.g., an event briefly appearing
 * in the wrong location during drag-drop).
 *
 * @example
 * ```typescript
 * const neverBad = assertNeverAppears(page, '.all-day-row .event', 'Event should not appear in All Day');
 * await page.dragAndDrop('.event', '.time-slot');
 * await neverBad.verify();
 * ```
 */
export function assertNeverAppears(
  page: Page,
  selector: string,
  message?: string
): { verify: () => Promise<void>; stop: () => Promise<void> } {
  let violations: Array<{ timestamp: number; html: string }> = [];
  let stopped = false;

  // Start monitoring via MutationObserver
  const monitorPromise = page.evaluate(
    ({ selector, startTime }) => {
      return new Promise<Array<{ timestamp: number; html: string }>>((resolve) => {
        const violations: Array<{ timestamp: number; html: string }> = [];

        const checkForViolations = () => {
          const matches = document.querySelectorAll(selector);
          if (matches.length > 0) {
            violations.push({
              timestamp: performance.now() - startTime,
              html: Array.from(matches)
                .map((el) => el.outerHTML.slice(0, 200))
                .join('\n'),
            });
          }
        };

        // Check immediately
        checkForViolations();

        // Set up mutation observer
        const observer = new MutationObserver(() => {
          checkForViolations();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-state'],
        });

        // Also poll periodically (catches CSS-only changes)
        const interval = setInterval(checkForViolations, 16); // ~60fps

        // Store cleanup function globally so we can call it later
        (window as unknown as Record<string, unknown>).__qualityMonitorCleanup = () => {
          observer.disconnect();
          clearInterval(interval);
          resolve(violations);
        };
      });
    },
    { selector, startTime: Date.now() }
  );

  return {
    verify: async () => {
      // Stop monitoring and get results
      violations = await page.evaluate(() => {
        const cleanup = (window as unknown as Record<string, () => Array<{ timestamp: number; html: string }>>)
          .__qualityMonitorCleanup;
        if (cleanup) {
          return cleanup();
        }
        return [];
      });

      stopped = true;

      if (violations.length > 0) {
        const details = violations
          .map((v) => `  At ${v.timestamp.toFixed(0)}ms:\n    ${v.html}`)
          .join('\n');
        throw new Error(
          `${message || `Selector "${selector}" appeared during operation`}\n\nViolations:\n${details}`
        );
      }
    },

    stop: async () => {
      if (!stopped) {
        await page.evaluate(() => {
          const cleanup = (window as unknown as Record<string, () => void>).__qualityMonitorCleanup;
          if (cleanup) cleanup();
        });
        stopped = true;
      }
    },
  };
}

/**
 * Run an action within a performance budget. Fails if the action takes
 * longer than the specified milliseconds.
 *
 * @example
 * ```typescript
 * await withPerformanceBudget(page, {
 *   operation: 'open modal',
 *   budget: 150,
 *   action: async () => {
 *     await page.click('.trigger');
 *     await expect(page.locator('[role="dialog"]')).toBeVisible();
 *   },
 * });
 * ```
 */
export async function withPerformanceBudget(
  page: Page,
  options: {
    operation: string;
    budget: number; // milliseconds
    action: () => Promise<void>;
    /** If true, log timing even on success */
    verbose?: boolean;
  }
): Promise<{ duration: number }> {
  const { operation, budget, action, verbose } = options;

  const start = Date.now();
  await action();
  const duration = Date.now() - start;

  if (verbose || duration > budget) {
    console.log(`[Performance] ${operation}: ${duration}ms (budget: ${budget}ms)`);
  }

  if (duration > budget) {
    throw new Error(
      `Performance budget exceeded for "${operation}"\n` +
        `  Expected: ≤${budget}ms\n` +
        `  Actual: ${duration}ms\n` +
        `  Over budget by: ${duration - budget}ms`
    );
  }

  return { duration };
}

/**
 * Assert that an element does not shift position during an operation.
 * Useful for detecting layout shifts during loading or interaction.
 *
 * @example
 * ```typescript
 * const stable = assertNoLayoutShift(page, {
 *   selector: '.main-content',
 *   threshold: 2, // Allow 2px for subpixel rendering
 * });
 * await page.goto('/dashboard');
 * await stable.verify();
 * ```
 */
export function assertNoLayoutShift(
  page: Page,
  options: {
    selector: string;
    threshold?: number; // pixels, default 0
  }
): { verify: () => Promise<void> } {
  const { selector, threshold = 0 } = options;

  // Capture initial position
  let initialRect: DOMRect | null = null;
  let positionHistory: Array<{ x: number; y: number; timestamp: number }> = [];

  const startMonitoring = page.evaluate(
    ({ selector, threshold }) => {
      return new Promise<void>((resolve) => {
        const el = document.querySelector(selector);
        if (!el) {
          console.warn(`[LayoutShift] Element not found: ${selector}`);
          resolve();
          return;
        }

        const initialRect = el.getBoundingClientRect();
        const history: Array<{ x: number; y: number; timestamp: number }> = [
          { x: initialRect.x, y: initialRect.y, timestamp: 0 },
        ];

        const startTime = performance.now();

        const checkPosition = () => {
          const rect = el.getBoundingClientRect();
          const last = history[history.length - 1];

          const deltaX = Math.abs(rect.x - last.x);
          const deltaY = Math.abs(rect.y - last.y);

          if (deltaX > threshold || deltaY > threshold) {
            history.push({
              x: rect.x,
              y: rect.y,
              timestamp: performance.now() - startTime,
            });
          }
        };

        const interval = setInterval(checkPosition, 16);

        (window as unknown as Record<string, unknown>).__layoutShiftData = {
          history,
          initialRect: { x: initialRect.x, y: initialRect.y },
          cleanup: () => {
            clearInterval(interval);
            return history;
          },
        };

        resolve();
      });
    },
    { selector, threshold }
  );

  return {
    verify: async () => {
      await startMonitoring;

      const result = await page.evaluate(() => {
        const data = (window as unknown as Record<string, {
          history: Array<{ x: number; y: number; timestamp: number }>;
          initialRect: { x: number; y: number };
          cleanup: () => Array<{ x: number; y: number; timestamp: number }>;
        }>).__layoutShiftData;

        if (!data) return { shifted: false, history: [] };

        const history = data.cleanup();
        return {
          shifted: history.length > 1,
          history,
          initialRect: data.initialRect,
        };
      });

      if (result.shifted) {
        const shifts = result.history
          .slice(1)
          .map(
            (pos, i) =>
              `  Shift ${i + 1} at ${pos.timestamp.toFixed(0)}ms: ` +
              `(${result.history[i].x}, ${result.history[i].y}) → (${pos.x}, ${pos.y})`
          )
          .join('\n');

        throw new Error(
          `Layout shift detected for "${options.selector}"\n\n` +
            `Initial position: (${result.initialRect.x}, ${result.initialRect.y})\n` +
            `Shifts detected:\n${shifts}`
        );
      }
    },
  };
}

/**
 * Assert that elements matching a selector have stable render (don't flicker).
 * Detects mount/unmount cycles that cause visual flashing.
 *
 * @example
 * ```typescript
 * const stable = assertStableRender(page, {
 *   selector: '.event-card',
 *   maxMountCycles: 1,
 * });
 * await page.fill('[data-testid="search"]', 'meeting');
 * await stable.verify();
 * ```
 */
export function assertStableRender(
  page: Page,
  options: {
    selector: string;
    maxMountCycles?: number; // default 1 (mount once, never unmount/remount)
  }
): { verify: () => Promise<void> } {
  const { selector, maxMountCycles = 1 } = options;

  const startMonitoring = page.evaluate(
    ({ selector }) => {
      const mountCounts = new Map<string, number>();
      const currentlyMounted = new Set<string>();

      const getElementKey = (el: Element): string => {
        // Try to get a stable identifier
        const id = el.getAttribute('id');
        if (id) return `#${id}`;

        const dataId = el.getAttribute('data-id') || el.getAttribute('data-testid');
        if (dataId) return `[data-id="${dataId}"]`;

        // Fall back to text content hash
        const text = el.textContent?.slice(0, 50) || '';
        return `text:${text}`;
      };

      const checkElements = () => {
        const current = document.querySelectorAll(selector);
        const currentKeys = new Set<string>();

        current.forEach((el) => {
          const key = getElementKey(el);
          currentKeys.add(key);

          if (!currentlyMounted.has(key)) {
            // Element mounted
            currentlyMounted.add(key);
            mountCounts.set(key, (mountCounts.get(key) || 0) + 1);
          }
        });

        // Check for unmounts
        currentlyMounted.forEach((key) => {
          if (!currentKeys.has(key)) {
            currentlyMounted.delete(key);
          }
        });
      };

      // Initial check
      checkElements();

      const observer = new MutationObserver(checkElements);
      observer.observe(document.body, { childList: true, subtree: true });

      const interval = setInterval(checkElements, 32);

      (window as unknown as Record<string, unknown>).__renderStabilityData = {
        mountCounts,
        cleanup: () => {
          observer.disconnect();
          clearInterval(interval);
          return Object.fromEntries(mountCounts);
        },
      };
    },
    { selector }
  );

  return {
    verify: async () => {
      await startMonitoring;

      // Small delay to catch any final render cycles
      await page.waitForTimeout(100);

      const result = await page.evaluate(
        ({ maxMountCycles }) => {
          const data = (window as unknown as Record<string, {
            mountCounts: Map<string, number>;
            cleanup: () => Record<string, number>;
          }>).__renderStabilityData;

          if (!data) return { violations: [] };

          const counts = data.cleanup();
          const violations = Object.entries(counts)
            .filter(([_, count]) => count > maxMountCycles)
            .map(([key, count]) => ({ key, count }));

          return { violations, all: counts };
        },
        { maxMountCycles }
      );

      if (result.violations.length > 0) {
        const details = result.violations
          .map((v) => `  "${v.key}": mounted ${v.count} times (max: ${maxMountCycles})`)
          .join('\n');

        throw new Error(
          `Render stability violation for "${selector}"\n\n` +
            `Elements remounted more than expected:\n${details}`
        );
      }
    },
  };
}

/**
 * Measure Cumulative Layout Shift (CLS) during an operation using the
 * browser's Layout Instability API.
 *
 * @example
 * ```typescript
 * const cls = await measureCLS(page, async () => {
 *   await page.goto('/dashboard');
 *   await page.waitForLoadState('networkidle');
 * });
 * expect(cls).toBeLessThan(0.1); // Good CLS score
 * ```
 */
export async function measureCLS(
  page: Page,
  action: () => Promise<void>
): Promise<number> {
  // Set up CLS measurement before action
  await page.evaluate(() => {
    (window as unknown as Record<string, number>).__clsValue = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count shifts without recent user input
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          (window as unknown as Record<string, number>).__clsValue +=
            (entry as PerformanceEntry & { value: number }).value;
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });
    (window as unknown as Record<string, PerformanceObserver>).__clsObserver = observer;
  });

  // Perform the action
  await action();

  // Wait a bit for any final shifts
  await page.waitForTimeout(500);

  // Get and clean up
  const cls = await page.evaluate(() => {
    const observer = (window as unknown as Record<string, PerformanceObserver>).__clsObserver;
    if (observer) observer.disconnect();

    return (window as unknown as Record<string, number>).__clsValue || 0;
  });

  return cls;
}

/**
 * Assert that a specific DOM state is reached within a timeout, but also
 * that certain intermediate states never occur.
 *
 * Combines waiting for success with guarding against bad states.
 *
 * @example
 * ```typescript
 * await assertReachesStateWithout(page, {
 *   success: '.time-slot .event[data-id="123"]',
 *   forbidden: ['.all-day-row .event[data-id="123"]', '.trash .event[data-id="123"]'],
 *   timeout: 5000,
 *   message: 'Event should reach time slot without passing through All Day or Trash',
 * });
 * ```
 */
export async function assertReachesStateWithout(
  page: Page,
  options: {
    success: string;
    forbidden: string[];
    timeout?: number;
    message?: string;
  }
): Promise<void> {
  const { success, forbidden, timeout = 5000, message } = options;

  // Start monitoring for forbidden states
  const monitors = forbidden.map((selector) =>
    assertNeverAppears(page, selector, `Forbidden state appeared: ${selector}`)
  );

  try {
    // Wait for success state
    await expect(page.locator(success)).toBeVisible({ timeout });

    // Verify no forbidden states occurred
    for (const monitor of monitors) {
      await monitor.verify();
    }
  } catch (error) {
    // Clean up monitors
    for (const monitor of monitors) {
      await monitor.stop();
    }

    if (message) {
      throw new Error(`${message}\n\nOriginal error: ${error}`);
    }
    throw error;
  }
}

/**
 * Performance budget presets for common operations.
 */
export const PERFORMANCE_BUDGETS = {
  /** Modal/dialog/popover should appear */
  modalOpen: 150,

  /** Dropdown/menu should appear */
  dropdownOpen: 100,

  /** Drag operation should complete */
  dragComplete: 100,

  /** Navigation transition */
  pageTransition: 300,

  /** Data fetch and render (without network) */
  dataRender: 200,

  /** Search/filter results update */
  searchUpdate: 150,

  /** Form submission feedback */
  formFeedback: 100,
} as const;

/**
 * CLS thresholds per Web Vitals guidelines.
 */
export const CLS_THRESHOLDS = {
  /** Good user experience */
  good: 0.1,

  /** Needs improvement */
  needsImprovement: 0.25,

  /** Poor user experience */
  poor: 0.25,
} as const;
