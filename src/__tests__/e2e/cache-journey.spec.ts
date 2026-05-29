import { test, expect } from '@playwright/test';

test.describe('OPFS Cache Persistence & Air-Gap Resilience', () => {
  test('should download model, persist in CacheStorage, and survive offline reload', async ({ page, context }) => {
    // 1. Ensure clean slate
    await context.clearCookies();
    
    // Set a very long timeout for the download process
    test.setTimeout(300000); // 5 minutes

    // 2. Boot App with network active
    await page.goto('/');

    // Wait for the app to initialize its basic DB/State
    await page.waitForLoadState('networkidle');

    // Handle any initial intake/login wizard if it exists (Assuming we can bypass or it's simple)
    // For EA-NITI, if it asks for a pseudokey on first load, we need to enter it.
    const hasWizard = await page.isVisible('text="Create your Air-Gapped Pseudokey"');
    if (hasWizard) {
      await page.fill('input[type="password"]', 'testpass123');
      await page.click('button:has-text("Initialize")');
      await page.waitForSelector('text="Network & Privacy"'); // Wait for UI to load
    }

    // 3. Enable Network Integrations
    // Go to admin panel
    await page.goto('/admin');
    await page.waitForTimeout(1000);

    // Click "System & Preference" to expand the submenu if needed
    const sysPrefBtn = page.locator('button:has-text("System & Preference")');
    if (await sysPrefBtn.isVisible()) {
        await sysPrefBtn.click();
        await page.waitForTimeout(500);
    }

    // Navigate to Network Integration Tab
    await page.click('button:has-text("Network & Privacy")');
    
    // Toggle network on if off
    const networkToggle = page.locator('button[aria-label="Toggle External Network"], input[type="checkbox"]');
    if (await networkToggle.first().isVisible()) {
        await networkToggle.first().click();
        const acceptBtn = page.locator('button:has-text("I Accept & Save")');
        if (await acceptBtn.isVisible()) {
            await acceptBtn.click();
        }
    }

    // 4. Consent & Cache Model
    // Click "Agent Center" to expand the submenu if needed
    const agentCenterBtn = page.locator('button:has-text("Agent Center")');
    if (await agentCenterBtn.isVisible()) {
        await agentCenterBtn.click();
        await page.waitForTimeout(500);
    }

    // Go to Agent Config Tab
    await page.click('button:has-text("Agent Configurations")');
    
    // Find the Cache button for the Tiny Triage agent (gemma-2b) because it's smaller and faster to download
    // Wait for Cache button to appear
    await page.waitForSelector('button:has-text("Cache")');
    
    // Click Cache for Triage model (assuming it's the second one or we can find it by specific selector if needed, 
    // for now we click the first available Cache button, which is usually Primary, but that's fine too)
    const cacheButtons = await page.locator('button:has-text("Cache")').all();
    if (cacheButtons.length > 0) {
        await cacheButtons[1].click(); // Try Triage first if available
    } else {
        throw new Error("No Cache button found");
    }

    // Handle Consent Modal
    await page.waitForSelector('text="AI Model Download Required"');
    await page.click('input[type="checkbox"]');
    await page.click('button:has-text("Consent & Download")');

    // 5. Wait for Sync
    // Wait for the Global Progress Widget to show 'Complete'
    await page.waitForSelector('text="Model cached successfully."', { timeout: 240000 }); // Wait up to 4 mins for download

    // Let the DB write settle
    await page.waitForTimeout(2000);

    // Verify it says Cached
    await expect(page.locator('button:has-text("Cached")').first()).toBeVisible();

    // 6. Simulate Air-Gap (Offline Mode)
    await context.setOffline(true);

    // 7. Hard Reload
    await page.reload({ waitUntil: 'networkidle' });

    // 8. Assert Persistence
    // Go back to Agent Config
    await page.goto('/admin');
    await page.click('button:has-text("Agent Configurations")');
    
    // Wait for db config load
    await page.waitForTimeout(1000);
    
    // The button should instantly show "Cached" without hanging or throwing network errors
    const cachedButton = page.locator('button:has-text("Cached")').first();
    await expect(cachedButton).toBeVisible({ timeout: 10000 });
    
    // Ensure no 'Connecting to registry...' widget is stuck
    await expect(page.locator('text="Reconnecting to model registry..."')).not.toBeVisible();
  });
});
