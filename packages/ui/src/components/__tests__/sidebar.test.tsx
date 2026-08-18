import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarNavItem } from '../sidebar';

// vitest doesn't auto-run testing-library's cleanup between tests (that's normally wired
// up by a jest/vitest preset); do it explicitly so each test starts with an empty document.
afterEach(cleanup);

describe('SidebarNavItem', () => {
  it('renders asChild onto a single <Link>-like anchor without throwing, preserving icon/label/suffix and the anchor href', () => {
    render(
      <SidebarNavItem asChild icon={<svg data-testid="icon" />} suffix={<b>Off</b>}>
        <a href="/x">
          <span>Label</span>
        </a>
      </SidebarNavItem>,
    );

    const anchor = screen.getByRole('link');
    expect(anchor.getAttribute('href')).toBe('/x');
    expect(anchor.className).toMatch(/\bflex\b/);
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(screen.getByText('Label')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('renders a plain <a> with wrapped label when asChild is omitted', () => {
    render(
      <SidebarNavItem icon={<svg data-testid="icon" />} suffix={<b>Off</b>} href="/y">
        Label
      </SidebarNavItem>,
    );

    const anchor = screen.getByRole('link');
    expect(anchor.getAttribute('href')).toBe('/y');
    expect(anchor.className).toMatch(/\bflex\b/);
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(screen.getByText('Label')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
  });
});
