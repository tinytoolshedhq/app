import { explainLevel, levelCopyKey } from '../src/lib/levels';

describe('level explanation', () => {
  it('maps estimates to everyday references', () => {
    expect(explainLevel(null)).toBeNull();
    expect(explainLevel(30)).toBe('quiet');
    expect(explainLevel(59)).toBe('conversation');
    expect(explainLevel(60)).toBe('busy');
    expect(explainLevel(90)).toBe('loud');
    expect(explainLevel(100)).toBe('veryLoud');
    expect(levelCopyKey(60)).toBe('level.busy');
  });
});
