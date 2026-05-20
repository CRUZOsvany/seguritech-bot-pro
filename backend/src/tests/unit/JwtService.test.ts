import { JwtService } from '@/infrastructure/auth/JwtService';

const SECRET = 'a'.repeat(64);

describe('JwtService', () => {
  it('rechaza secret menor a 64 chars', () => {
    expect(() => new JwtService('corto', 60)).toThrow();
  });

  it('sign + verify round trip preserva claims', () => {
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

    const payload = svc.verify(token);
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
});
