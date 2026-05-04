import { describe, expect, it } from 'vitest';
import { selectProjectFolder } from './native';

describe('native project folder selection shim', () => {
  it('preserves manual project path entry in browser dev mode', async () => {
    const selection = await selectProjectFolder('/home/user/repo');

    expect(selection).toEqual({
      selectedPath: '/home/user/repo',
      displayName: 'repo',
      source: 'browser-dev-manual'
    });
  });

  it('rejects empty manual project paths before native invocation', async () => {
    await expect(selectProjectFolder('   ')).rejects.toThrow('Enter a project folder path first.');
  });
});
