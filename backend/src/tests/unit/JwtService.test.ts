import { JwtService } from '@/infrastructure/auth/JwtService';

const SECRET = 'a'.repeat(64);

describe('JwtService', () => {
  it('rechaza secret menor a 64 chars', () => {
    expect(() => new JwtService('corto', 60)).toThrow();
  });

  it('sign + verify round trip preserva claims (admin)', () => {
    const svc = new JwtService(SECRET, 60);
    const { token, jti, exp } = svc.sign({
      sub: 'admin-1',
      email: 'micho@seguritech.com',
      role: 'super_admin',
      tenantId: null,
    });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
    expect(typeof jti).toBe('string');
    expect(jti.length).toBeGreaterThan(0);

    const payload = svc.verify(token, 'admin');
    expect(payload.sub).toBe('admin-1');
    expect(payload.email).toBe('micho@seguritech.com');
    expect(payload.role).toBe('super_admin');
    expect(payload.tenantId).toBeNull();
    expect(payload.jti).toBe(jti);
    expect(payload.exp).toBe(exp);
  });

  it('genera un jti distinto cada firma', () => {
    const svc = new JwtService(SECRET, 60);
    const a = svc.sign({ sub: 'x', email: 'a@b', role: 'admin_operator', tenantId: 't1' });
    const b = svc.sign({ sub: 'x', email: 'a@b', role: 'admin_operator', tenantId: 't1' });
    expect(a.jti).not.toBe(b.jti);
  });

  it('rechaza firma alterada', () => {
    const svc = new JwtService(SECRET, 60);
    const { token } = svc.sign({
      sub: 'admin-1',
      email: 'x@y',
      role: 'super_admin',
      tenantId: null,
    });
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -2) + 'AA';
    expect(() => svc.verify(parts.join('.'))).toThrow(/firma|inv/i);
  });

  it('rechaza token con secret distinto', () => {
    const a = new JwtService(SECRET, 60);
    const b = new JwtService('b'.repeat(64), 60);
    const { token } = a.sign({
      sub: 'admin-1',
      email: 'x@y',
      role: 'super_admin',
      tenantId: null,
    });
    expect(() => b.verify(token)).toThrow();
  });

  it('rechaza token expirado', () => {
    const svc = new JwtService(SECRET, -10);
    const { token } = svc.sign({
      sub: 'admin-1',
      email: 'x@y',
      role: 'super_admin',
      tenantId: null,
    });
    expect(() => svc.verify(token)).toThrow(/expirado/i);
  });

  it('rechaza JWT malformado', () => {
    const svc = new JwtService(SECRET, 60);
    expect(() => svc.verify('no.es.un.jwt.valido')).toThrow();
    expect(() => svc.verify('solo-una-parte')).toThrow();
  });

  // ============================================================
  // Sprint 5.1a — POS scope
  // ============================================================

  it('sign + verify round trip preserva claims (pos)', () => {
    const svc = new JwtService(SECRET, 60);
    const { token, jti } = svc.sign({
      sub: 'cashier-uuid-1',
      displayName: 'Demo Cajera',
      role: 'pos_cashier',
      tenantId: 'tenant-uuid-1',
      scope: 'pos',
    });

    const payload = svc.verify(token, 'pos');
    expect(payload.scope).toBe('pos');
    expect(payload.sub).toBe('cashier-uuid-1');
    expect(payload.displayName).toBe('Demo Cajera');
    expect(payload.role).toBe('pos_cashier');
    expect(payload.tenantId).toBe('tenant-uuid-1');
    expect(payload.jti).toBe(jti);
  });

  it('verify(token, "admin") rechaza token con scope=pos', () => {
    const svc = new JwtService(SECRET, 60);
    const { token } = svc.sign({
      sub: 'cashier-1',
      displayName: 'Cajera',
      role: 'pos_cashier',
      tenantId: 'tenant-1',
      scope: 'pos',
    });
    expect(() => svc.verify(token, 'admin')).toThrow(/scope/i);
  });

  it('verify(token, "pos") rechaza token sin scope (admin legacy)', () => {
    const svc = new JwtService(SECRET, 60);
    const { token } = svc.sign({
      sub: 'admin-1',
      email: 'a@b',
      role: 'super_admin',
      tenantId: null,
    });
    expect(() => svc.verify(token, 'pos')).toThrow(/scope/i);
  });

  it('verify(token, "admin") acepta token legacy sin scope (retrocompat)', () => {
    // Tokens emitidos pre-Sprint-5.1a no incluyen el claim scope.
    // El overload con 'admin' debe seguir aceptándolos (scope ?? 'admin').
    const svc = new JwtService(SECRET, 60);
    const { token } = svc.sign({
      sub: 'admin-legacy',
      email: 'legacy@admin',
      role: 'admin_operator',
      tenantId: 'tenant-x',
    });
    const payload = svc.verify(token, 'admin');
    expect(payload.role).toBe('admin_operator');
    expect(payload.scope).toBeUndefined();
  });

  it('verify(token) sin scope esperado devuelve la unión narrow-able', () => {
    const svc = new JwtService(SECRET, 60);
    const adminToken = svc.sign({
      sub: 'admin-1',
      email: 'a@b',
      role: 'super_admin',
      tenantId: null,
    }).token;
    const posToken = svc.sign({
      sub: 'cashier-1',
      displayName: 'X',
      role: 'pos_cashier',
      tenantId: 't',
      scope: 'pos',
    }).token;

    const a = svc.verify(adminToken);
    const p = svc.verify(posToken);

    // Narrow por scope
    if (a.scope === 'pos') {
      throw new Error('expected admin');
    }
    expect(a.role).toBe('super_admin');

    if (p.scope !== 'pos') {
      throw new Error('expected pos');
    }
    expect(p.displayName).toBe('X');
  });
});
