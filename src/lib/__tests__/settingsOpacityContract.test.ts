import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../components/Settings/Settings.css', import.meta.url), 'utf8');

describe('settings panel opacity contract', () => {
  it('keeps glass optics tied to the user opacity variable', () => {
    const start = css.indexOf('.settings-glass-enabled .floating-settings-panel {');
    const end = css.indexOf('.glass-preview-enabled .background-preview-panel', start);
    const glassRules = css.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(glassRules).toContain('var(--settings-panel-alpha, 90%)');
    expect(glassRules).toContain('var(--panel-solid, var(--panel))');
    expect(glassRules).not.toMatch(/var\(--panel\)\s+(?:62|68)%/);
    expect(glassRules).not.toMatch(/var\(--panel-2\)\s+66%/);
  });
});
