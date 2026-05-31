import {
  isValidServiceTransition,
  assertServiceTransition,
  ServiceTransitionError,
} from '@/domain/services/serviceFsm';

describe('serviceFsm', () => {
  it('permite el camino feliz draft→configuring→active→paused→active', () => {
    expect(isValidServiceTransition('draft', 'configuring')).toBe(true);
    expect(isValidServiceTransition('configuring', 'active')).toBe(true);
    expect(isValidServiceTransition('active', 'paused')).toBe(true);
    expect(isValidServiceTransition('paused', 'active')).toBe(true);
  });

  it('permite archivar desde cualquier estado y revivir desde archived', () => {
    expect(isValidServiceTransition('active', 'archived')).toBe(true);
    expect(isValidServiceTransition('draft', 'archived')).toBe(true);
    expect(isValidServiceTransition('archived', 'configuring')).toBe(true);
  });

  it('trata from===to como no-op válido', () => {
    expect(isValidServiceTransition('active', 'active')).toBe(true);
  });

  it('rechaza saltos ilegales', () => {
    expect(isValidServiceTransition('draft', 'active')).toBe(false);
    expect(isValidServiceTransition('archived', 'active')).toBe(false);
    expect(() => assertServiceTransition('draft', 'active')).toThrow(
      ServiceTransitionError,
    );
  });
});
