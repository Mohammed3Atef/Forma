import { test, expect, shot } from '../fixtures';

/**
 * Public website (claude.ai/design "Forma Website", as typed components): routing between the
 * design's pages, EN ⇄ ع synced with the app language, auth CTAs, contact form
 * validation + delivery fallback, legal TOC, and the old landing kept as a draft.
 */
test.describe('public website', () => {
  test('nav + footer route to every website page; CTAs open the auth form', async ({ anon }, testInfo) => {
    const { page } = await anon();
    await page.goto('/');
    await expect(page.getByTestId('website-home')).toBeVisible();
    await expect(page).toHaveTitle('Forma — Every client. Every plan. One place.');
    await expect(page.locator('main section').first()).toBeVisible();
    await shot(page, testInfo, 'website-home');

    // Hash links stay on the page and scroll to the section.
    await page.locator('#nav nav a[href="#pricing"]').click();
    await expect(page).toHaveURL(/\/#pricing$/);
    await expect(page.locator('#pricing')).toBeInViewport();

    await page.locator('#nav nav a[href="/contact"]').click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByTestId('website-contact')).toBeVisible();
    await expect(page).toHaveTitle('Contact — Forma');

    for (const [href, title] of [['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy'], ['/cookies', 'Cookie Policy']] as const) {
      await page.locator(`#foot a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator('main h1')).toHaveText(title);
      await expect(page).toHaveTitle(`${title} — Forma`);
    }

    // From a sub-page, "#pricing" links go home and land on the section.
    await page.locator('#foot a[href="/#pricing"]').click();
    await expect(page).toHaveURL(/\/#pricing$/);
    await expect(page.locator('#pricing')).toBeInViewport({ timeout: 10_000 });

    await page.getByTestId('website-cta-primary').click();
    await expect(page).toHaveURL(/\/login\?signup=1$/);
    await page.goBack();
    await page.getByTestId('website-login').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('ع toggle switches the page and the app language (persists into /login)', async ({ anon }, testInfo) => {
    const { page } = await anon();
    await page.goto('/');
    await expect(page.getByTestId('website-lang-toggle')).toHaveText('العربية');
    await page.getByTestId('website-lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('website-lang-toggle')).toHaveText('English');
    await expect(page.locator('#nav nav a[href="/contact"]')).toHaveText('تواصل معنا');
    await expect(page.locator('[data-plan=trial]')).toHaveText(/تجربة مجانية/);
    await shot(page, testInfo, 'website-home-ar');
    await page.getByTestId('website-login').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // Back to English so later specs start from the default.
    await page.goto('/');
    await page.getByTestId('website-lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('contact: validation, then delivery (falls back to mailto: when email is unavailable)', async ({ anon, db, audit }, testInfo) => {
    // The e2e3 stack has email disabled → the endpoint answers CONTACT_UNAVAILABLE (500) by design.
    audit.allow5xx(/contact\.submit/);
    await db.deleteMany('rateLimits', {});
    const { page } = await anon();
    await page.goto('/contact');
    const form = page.locator('#ctForm');
    await form.locator('#ctSend').click();
    await expect(page.locator('#ctAlert')).toBeVisible();
    for (const id of ['#f-name', '#f-email', '#f-role', '#f-msg']) await expect(form.locator(id)).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText('Please choose a reason.')).toBeVisible();
    await expect(page.locator('#f-name')).toBeFocused();
    await shot(page, testInfo, 'contact-errors');

    await page.fill('#f-name', 'Sara Coach');
    await expect(form.locator('#f-name')).toHaveAttribute('aria-invalid', 'false');
    await page.fill('#f-email', 'sara@example.com');
    await page.selectOption('#f-role', { index: 2 });
    await form.locator('label[for="r1"]').click();
    await page.fill('#f-msg', 'I coach about 30 clients online.');

    const sent = page.waitForResponse((r) => r.url().includes('contact.submit'));
    await form.locator('#ctSend').click();
    const res = await sent;
    expect([200, 500]).toContain(res.status());
    await expect(form.getByRole('status').getByRole('heading')).toHaveText('Message received.');
    await expect(form.locator('#ctSend')).toHaveCount(0);
    await shot(page, testInfo, 'contact-sent');
    await form.locator('#ctAgain').click();
    await expect(form.locator('#ctSend')).toBeVisible();
    await expect(page.locator('#f-name')).toHaveValue('');
  });

  test('legal: TOC highlights the section in view', async ({ anon }) => {
    const { page } = await anon();
    await page.goto('/privacy');
    const toc = page.getByRole('navigation', { name: 'Contents' }).locator('a');
    await expect(toc).toHaveCount(9);
    await toc.nth(4).click();
    await expect(toc.nth(4)).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(page.locator('#s5')).toBeInViewport();
  });

  test('leaving the website restores page settings; old landing kept as a noindex draft', async ({ anon }) => {
    const { page } = await anon();
    await page.goto('/');
    await expect(page.getByTestId('website-home')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.scrollPaddingTop)).toBe('84px');
    // The auth form is part of the website: same nav and footer.
    await page.getByTestId('website-login').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('website-auth')).toBeVisible();
    await expect(page.locator('#nav')).toBeVisible();
    await expect(page.locator('#foot')).toBeVisible();
    // In-app navigation off the website: its html-level settings must not follow.
    await page.evaluate(() => {
      history.pushState({}, '', '/landing-v1');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.scrollPaddingTop)).toBe('');
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
