import { describe, expect, it } from 'vitest';

import { isSafeApplicationPath } from './notification-templates';

describe('academic notification target paths', () => {
  it('accepts application-relative student and teacher routes', () => {
    expect(isSafeApplicationPath('/estudiante/asignaturas/course/items/item')).toBe(true);
    expect(isSafeApplicationPath('/docente/revisiones/submission')).toBe(true);
    expect(isSafeApplicationPath('/docente/revisiones?learningItemId=item')).toBe(true);
  });

  it('rejects external, protocol-relative, and browser-normalized paths', () => {
    expect(isSafeApplicationPath('https://example.test/away')).toBe(false);
    expect(isSafeApplicationPath('//example.test/away')).toBe(false);
    expect(isSafeApplicationPath('/\\\\example.test/away')).toBe(false);
  });
});
