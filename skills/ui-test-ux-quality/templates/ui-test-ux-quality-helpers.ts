/**
 * UI Test UX Quality Helpers
 *
 * Quality-beyond-correctness testing utilities for Playwright.
 * Copy this file to your project's e2e/helpers/ directory.
 */

import { Page, Locator, expect } from '@playwright/test';

// ============================================================================
// State Stability (catches competing render bugs after mutations)
// ============================================================================

export interface StateStabilityOptions {
  /** The locator to monitor */
  locator: Locator;
  /** How long to monitor (ms) */
  duration: number;
  /** Expected visibility state */
  expectVisible: boolean;
  /** Check interval in ms (default: 100) */
  interval?: number;
  /** Error context for failure messages */
  errorContext?: string;
}

/**
 * Assert that an element's visibility state remains stable over time.
 *
 * Use this after mutations (create/update/delete) to catch competing render bugs
 * where optimistic updates pass initial assertions but get overwritten by
 * cache invalidation, refetch, or realtime subscriptions.
 *
 * @example
 * ```typescript
 * await page.click('[data-testid="save"]');
 * await expect(eventInSlot).toBeVisible();
 *
 * // Verify state stays stable for 2 seconds
 * await assertStateStability(page, {
 *   locator: eventInSlot,
 *   duration: 2000,
 *   expectVisible: true,
 *   errorContext: 'Event should remain in slot row after save',
 * });
 * ```
 */
export async function assertStateStability(
  page: Page,
  options: StateStabilityOptions
): Promise<void> {
  const {
    locator,
    duration,
    expectVisible,
    interval = 100,
    errorContext,
  } = options;

  const checkCount = Math.ceil(duration / interval);
  const intervals = Array(checkCount).fill(interval);

  const message = errorContext
    ? `State stability failed: ${errorContext}`
    : `State stability failed: Element ${expectVisible ? 'disappeared' : 'appeared'} unexpectedly`;

  await expect
    .poll(async () => await locator.isVisible(), {
      message,
      timeout: duration + 500, // Small buffer for timing
      intervals,
    })
    .toBe(expectVisible);
}

// ============================================================================
// Negative Assertions (assert bad states never appear during operations)
// ============================================================================

export interface NeverAppearsHandle {
  /** Stop monitoring and verify no violations occurred */
  verify: () => Promise<void>;
}

/**
 * Assert that an element NEVER appears during an operation.
 *
 * Start monitoring BEFORE the action, then call verify() after.
 *
 * @example
 * ```typescript
 * const neverAllDay = assertNeverAppears(
 *   page,
 *   '.all-day-row .event[data-id="123"]',
 *   'Event should never appear in All Day row during time slot drag'
 * );
 *
 * await page.dragAndDrop('.event[data-id="123"]', '.time-slot-9am');
 *
 * await neverAllDay.verify();
 * ```
 */
export function assertNeverAppears(
  page: Page,
  selector: string,
  errorMessage: string
): NeverAppearsHandle {
  let violation: { timestamp: number } | null = null;
  let stopped = false;

  // Start polling immediately
  const pollInterval = setInterval(async () => {
    if (stopped) return;
    try {
      const visible = await page.locator(selector).isVisible();
      if (visible && !violation) {
        violation = { timestamp: Date.now() };
      }
    } catch {
      // Element might not exist, which is fine
    }
  }, 50);

  return {
    verify: async () => {
      stopped = true;
      clearInterval(pollInterval);

      // One final check
      const finalVisible = await page.locator(selector).isVisible();
      if (finalVisible && !violation) {
        violation = { timestamp: Date.now() };
      }

      if (violation) {
        throw new Error(`Negative assertion failed: ${errorMessage}`);
      }
    },
  };
}

// ============================================================================
// Performance Budgets (fail when operations exceed acceptable durations)
// ============================================================================

export interface PerformanceBudgetOptions {
  /** Description of the operation being measured */
  operation: string;
  /** Maximum allowed duration in milliseconds */
  budget: number;
  /** The action to measure */
  action: () => Promise<void>;
}

/**
 * Fail test if an operation exceeds the performance budget.
 *
 * @example
 * ```typescript
 * await withPerformanceBudget(page, {
 *   operation: 'open event modal',
 *   budget: 150,
 *   action: async () => {
 *     await page.click('.event[data-id="123"]');
 *     await expect(page.locator('[role="dialog"]')).toBeVisible();
 *   },
 * });
 * ```
 */
export async function withPerformanceBudget(
  _page: Page,
  options: PerformanceBudgetOptions
): Promise<void> {
  const { operation, budget, action } = options;
  const start = Date.now();

  await action();

  const elapsed = Date.now() - start;
  if (elapsed > budget) {
    throw new Error(
      `Performance budget exceeded for "${operation}": ` +
        `took ${elapsed}ms, budget was ${budget}ms`
    );
  }
}

// ============================================================================
// Layout Shift Detection (detect elements that jump during operations)
// ============================================================================

export interface LayoutShiftOptions {
  /** CSS selector for element(s) to monitor */
  selector: string;
  /** Allowed movement threshold in pixels (default: 2 for subpixel rendering) */
  threshold?: number;
}

export interface LayoutShiftHandle {
  /** Stop monitoring and verify no layout shifts occurred */
  verify: () => Promise<void>;
}

/**
 * Detect layout shifts during operations.
 *
 * @example
 * ```typescript
 * const stable = assertNoLayoutShift(page, {
 *   selector: '.calendar-grid',
 *   threshold: 2,
 * });
 *
 * await page.goto('/calendar');
 * await page.waitForSelector('.event');
 *
 * await stable.verify();
 * ```
 */
export function assertNoLayoutShift(
  page: Page,
  options: LayoutShiftOptions
): LayoutShiftHandle {
  const { selector, threshold = 2 } = options;
  let initialPosition: { x: number; y: number } | null = null;
  let maxShift = 0;
  let stopped = false;

  const pollInterval = setInterval(async () => {
    if (stopped) return;
    try {
      const box = await page.locator(selector).first().boundingBox();
      if (box) {
        if (!initialPosition) {
          initialPosition = { x: box.x, y: box.y };
        } else {
          const shift = Math.max(
            Math.abs(box.x - initialPosition.x),
            Math.abs(box.y - initialPosition.y)
          );
          maxShift = Math.max(maxShift, shift);
        }
      }
    } catch {
      // Element might not exist yet
    }
  }, 50);

  return {
    verify: async () => {
      stopped = true;
      clearInterval(pollInterval);

      if (maxShift > threshold) {
        throw new Error(
          `Layout shift detected: ${selector} moved ${maxShift}px ` +
            `(threshold: ${threshold}px)`
        );
      }
    },
  };
}

// ============================================================================
// Render Stability (no flicker - element doesn't appear/disappear/reappear)
// ============================================================================

export interface StableRenderOptions {
  /** CSS selector for element(s) to monitor */
  selector: string;
  /** Maximum allowed mount/unmount cycles (default: 1) */
  maxMountCycles?: number;
}

export interface StableRenderHandle {
  /** Stop monitoring and verify no excessive mount cycles occurred */
  verify: () => Promise<void>;
}

/**
 * Ensure elements don't flicker (appear/disappear/reappear) during operations.
 *
 * @example
 * ```typescript
 * const stable = assertStableRender(page, {
 *   selector: '.event-card',
 *   maxMountCycles: 1,
 * });
 *
 * await page.fill('[data-testid="search"]', 'meeting');
 * await page.waitForTimeout(500);
 *
 * await stable.verify();
 * ```
 */
export function assertStableRender(
  page: Page,
  options: StableRenderOptions
): StableRenderHandle {
  const { selector, maxMountCycles = 1 } = options;
  let mountCycles = 0;
  let wasVisible = false;
  let stopped = false;

  const pollInterval = setInterval(async () => {
    if (stopped) return;
    try {
      const isVisible = await page.locator(selector).first().isVisible();
      if (isVisible && !wasVisible) {
        mountCycles++;
      }
      wasVisible = isVisible;
    } catch {
      wasVisible = false;
    }
  }, 50);

  return {
    verify: async () => {
      stopped = true;
      clearInterval(pollInterval);

      if (mountCycles > maxMountCycles) {
        throw new Error(
          `Render stability failed: ${selector} had ${mountCycles} mount cycles ` +
            `(max allowed: ${maxMountCycles}). This indicates flicker.`
        );
      }
    },
  };
}

// ============================================================================
// Mutual Exclusivity (element in exactly one location, not multiple)
// ============================================================================

export interface LocationSpec {
  /** Human-readable name for error messages */
  name: string;
  /** Locator for this location */
  locator: Locator;
}

export interface SnapshotLocationsResult {
  /** Names of locations where the element was found */
  locations: string[];
  /** Map of location name to visibility boolean */
  details: Record<string, boolean>;
}

/**
 * Snapshot which locations contain an element.
 *
 * Use this for debugging when mutual exclusivity tests fail.
 *
 * @example
 * ```typescript
 * const result = await snapshotElementLocations(page, {
 *   elementDescription: 'Event 123',
 *   locations: [
 *     { name: 'All Day Row', locator: page.locator('.all-day-row .event[data-id="123"]') },
 *     { name: 'Timed Area', locator: page.locator('.timed-area .event[data-id="123"]') },
 *   ],
 * });
 * console.log('Found in:', result.locations); // ['All Day Row', 'Timed Area'] = bug!
 * ```
 */
export async function snapshotElementLocations(
  _page: Page,
  options: {
    elementDescription: string;
    locations: LocationSpec[];
  }
): Promise<SnapshotLocationsResult> {
  const details: Record<string, boolean> = {};
  const foundLocations: string[] = [];

  for (const loc of options.locations) {
    const visible = await loc.locator.isVisible();
    details[loc.name] = visible;
    if (visible) {
      foundLocations.push(loc.name);
    }
  }

  return { locations: foundLocations, details };
}

export interface MutualExclusivityOptions {
  /** Description for error messages */
  elementDescription: string;
  /** The location where the element SHOULD be */
  expectedLocation: LocationSpec;
  /** Locations where the element should NOT be */
  forbiddenLocations: LocationSpec[];
}

/**
 * Assert element is in expected location and NOT in any forbidden locations.
 *
 * Instant check - use expectMutualExclusivity for monitoring over time.
 *
 * @example
 * ```typescript
 * await assertMutualExclusivity(page, {
 *   elementDescription: 'Event 123',
 *   expectedLocation: { name: 'Timed Area', locator: timedAreaEvent },
 *   forbiddenLocations: [
 *     { name: 'All Day Row', locator: allDayEvent },
 *   ],
 * });
 * ```
 */
export async function assertMutualExclusivity(
  _page: Page,
  options: MutualExclusivityOptions
): Promise<void> {
  const { elementDescription, expectedLocation, forbiddenLocations } = options;

  // Check expected location
  const inExpected = await expectedLocation.locator.isVisible();
  if (!inExpected) {
    throw new Error(
      `Mutual exclusivity failed: ${elementDescription} not found in expected location "${expectedLocation.name}"`
    );
  }

  // Check forbidden locations
  const violations: string[] = [];
  for (const loc of forbiddenLocations) {
    const visible = await loc.locator.isVisible();
    if (visible) {
      violations.push(loc.name);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Mutual exclusivity failed: ${elementDescription} found in forbidden location(s): ${violations.join(', ')}. ` +
        `Expected only in "${expectedLocation.name}".`
    );
  }
}

export interface ExpectMutualExclusivityOptions extends MutualExclusivityOptions {
  /** How long to monitor for violations (ms, default: 2000) */
  duration?: number;
  /** Check interval in ms (default: 100) */
  interval?: number;
}

/**
 * Assert element is in expected location and NOT in forbidden locations,
 * monitored over a duration to catch delayed/race condition bugs.
 *
 * @example
 * ```typescript
 * await expectMutualExclusivity(page, {
 *   elementDescription: 'Event after timing change',
 *   expectedLocation: { name: 'Timed Area', locator: timedAreaEvent },
 *   forbiddenLocations: [
 *     { name: 'All Day Row', locator: allDayEvent },
 *     { name: 'Slot Row', locator: slotEvent },
 *   ],
 *   duration: 2000, // Monitor for 2 seconds
 * });
 * ```
 */
export async function expectMutualExclusivity(
  page: Page,
  options: ExpectMutualExclusivityOptions
): Promise<void> {
  const {
    elementDescription,
    expectedLocation,
    forbiddenLocations,
    duration = 2000,
    interval = 100,
  } = options;

  const endTime = Date.now() + duration;
  let lastError: Error | null = null;

  while (Date.now() < endTime) {
    try {
      await assertMutualExclusivity(page, {
        elementDescription,
        expectedLocation,
        forbiddenLocations,
      });
    } catch (e) {
      lastError = e as Error;
      // Continue monitoring - we want to catch any violation during the duration
    }

    // Also fail immediately if we detect a violation
    for (const loc of forbiddenLocations) {
      const visible = await loc.locator.isVisible();
      if (visible) {
        throw new Error(
          `Mutual exclusivity failed: ${elementDescription} found in forbidden location "${loc.name}" ` +
            `while monitoring. Expected only in "${expectedLocation.name}".`
        );
      }
    }

    // Check expected location is still there
    const inExpected = await expectedLocation.locator.isVisible();
    if (!inExpected) {
      throw new Error(
        `Mutual exclusivity failed: ${elementDescription} disappeared from expected location ` +
          `"${expectedLocation.name}" while monitoring.`
      );
    }

    await page.waitForTimeout(interval);
  }

  // Final check
  await assertMutualExclusivity(page, {
    elementDescription,
    expectedLocation,
    forbiddenLocations,
  });

  // If we had errors during monitoring but final check passed, that's still a bug
  // (element was in multiple places at some point)
  if (lastError) {
    throw lastError;
  }
}

// ============================================================================
// CLS Measurement (Cumulative Layout Shift via browser API)
// ============================================================================

/**
 * Measure Cumulative Layout Shift during an operation.
 *
 * @example
 * ```typescript
 * const cls = await measureCLS(page, async () => {
 *   await page.goto('/dashboard');
 *   await page.waitForLoadState('networkidle');
 *   await page.waitForTimeout(1000);
 * });
 *
 * expect(cls).toBeLessThan(0.1); // Good CLS score
 * ```
 */
export async function measureCLS(
  page: Page,
  action: () => Promise<void>
): Promise<number> {
  // Inject CLS observer before action
  await page.evaluate(() => {
    (window as unknown as { __cls__: number }).__cls__ = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          (window as unknown as { __cls__: number }).__cls__ += (entry as PerformanceEntry & { value: number }).value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  });

  await action();

  // Retrieve CLS value
  const cls = await page.evaluate(
    () => (window as unknown as { __cls__: number }).__cls__
  );
  return cls;
}
