import { describe, expect, it } from 'vitest';
import { setIterations } from './engine/config';
import { isPlaceholderConfig, PLACEHOLDER_CONFIG } from './placeholder';

describe('isPlaceholderConfig', () => {
  it('recognises the placeholder test team at any iteration count', () => {
    expect(isPlaceholderConfig(PLACEHOLDER_CONFIG)).toBe(true);
    expect(isPlaceholderConfig(setIterations(PLACEHOLDER_CONFIG, 100))).toBe(true);
    expect(isPlaceholderConfig(setIterations(PLACEHOLDER_CONFIG, 1000))).toBe(true);
  });

  it('does not label an edited or different config as the placeholder', () => {
    expect(isPlaceholderConfig(PLACEHOLDER_CONFIG.replace('cons=0', 'cons=2'))).toBe(false);
    expect(isPlaceholderConfig('')).toBe(false);
  });
});
