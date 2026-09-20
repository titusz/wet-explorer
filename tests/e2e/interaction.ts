/** Observe visible responses and clipboard results without changing the system clipboard. */
import type { Page } from "@playwright/test";

/** Capture clipboard writes inside the test page only. */
export async function captureClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          Object.defineProperty(window, "copiedText", {
            value,
            configurable: true,
          });
        },
      },
    });
  });
}

/** Measure activation through a paint opportunity after the expected DOM change. */
export async function paintAfterClick(
  page: Page,
  target: string,
  ready: string,
): Promise<number> {
  return page.evaluate(
    ({ target, ready }) =>
      new Promise<number>((resolve, reject) => {
        const button = document.querySelector<HTMLElement>(target);
        if (!button) {
          reject(new Error(`Missing click target: ${target}`));
          return;
        }
        const start = performance.now();
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Click did not paint: ${ready}`));
        }, 1500);
        const observer = new MutationObserver(() => {
          if (!document.querySelector(ready)) return;
          observer.disconnect();
          requestAnimationFrame(() =>
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(performance.now() - start);
            }, 0),
          );
        });
        observer.observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        button.click();
      }),
    { target, ready },
  );
}
