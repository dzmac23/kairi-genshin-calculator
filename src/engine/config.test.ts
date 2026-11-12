import { describe, expect, it } from 'vitest';
import { defaultWorkerCount, setIterations } from './config';

describe('setIterations', () => {
  it('replaces an existing iteration count', () => {
    expect(setIterations('options iteration=500 duration=90 swap_delay=12;', 100)).toBe(
      'options iteration=100 duration=90 swap_delay=12;',
    );
  });

  it('adds an iteration count to an options line without one', () => {
    expect(setIterations('options duration=90;', 1000)).toBe('options iteration=1000 duration=90;');
  });

  it('adds an options line when there is none', () => {
    expect(setIterations('active furina;', 100)).toBe('options iteration=100;\nactive furina;');
  });

  it('only touches the options line', () => {
    const config = 'furina add weapon="x" iteration=3;\noptions iteration=500 duration=90;';
    expect(setIterations(config, 100)).toBe('furina add weapon="x" iteration=3;\noptions iteration=100 duration=90;');
  });

  it('never goes below 1 iteration', () => {
    expect(setIterations('options iteration=500;', 0)).toBe('options iteration=1;');
  });
});

describe('defaultWorkerCount', () => {
  it('uses cores minus two, between 3 and 4 when memory is unknown', () => {
    expect(defaultWorkerCount(8, undefined)).toBe(4);
    expect(defaultWorkerCount(4, undefined)).toBe(3);
  });

  it('allows up to 8 workers with 8 GB or more', () => {
    expect(defaultWorkerCount(16, 8)).toBe(8);
    expect(defaultWorkerCount(8, 8)).toBe(6);
  });

  it('uses 3 on low-memory devices or when cores are unknown', () => {
    expect(defaultWorkerCount(8, 2)).toBe(3);
    expect(defaultWorkerCount(undefined, 8)).toBe(3);
  });
});
