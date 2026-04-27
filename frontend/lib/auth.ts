/**
 * Configuración de NextAuth.js para autenticación y manejo de sesiones
 * Soporta MultiTenant con roles (SuperAdmin, AdminOperador)
 */

import NextAuthConfig from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createServiceClient } from './supabase';
import { UserRole } from './types';
import { LoginSchema } from './validators';

/**
 * Validar credenciales contra Supabase
 */
async function authenticateUser(email: string, password: string) {
  try {
    const supabase = createServiceClient();

    // Buscar usuario en tabla admin_users
    const { data: adminUser, error: userError } = await supabase
      .from('admin_users')
      .select('id, user_id, email, role, tenant_id, name, password_hash')
      .eq('email', email)
      .single();

    if (userError || !adminUser) {
      console.warn('Usuario no encontrado:', email);
      return null;
    }

    // Aquí iría validación de password con bcrypt
    // Por ahora es un placeholder - en producción usar bcrypt.compare()
    // const isPasswordValid = await bcrypt.compare(password, adminUser.password_hash);
    // 
    // TEMPORAL: Para desarrollo, si es igual devolvemos true
    // EN PRODUCCIÓN IMPLEMENTAR BCRYPT PROPERLY
    const isPasswordValid = password === adminUser.password_hash; // TEMPORAL
    
    if (!isPasswordValid) {
      console.warn('Contraseña inválida para:', email);
      return null;
    }

    return {
      id: adminUser.user_id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role as UserRole,
      tenantId: adminUser.tenant_id,
    };
  } catch (error) {
    console.error('Error autenticando usuario:', error);
    return null;
  }
}

export const authConfig = {
  // Usar JWT para sesiones sin estado
  session: {
    strategy: 'jwt' as const,
    maxAge: 24 * 60 * 60, // 24 horas
  },

  // Configurar cookies
  cookies: {
    sessionToken: {
       name: 'next-auth.session-token',
       options: {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax' as const,
         path: '/',
       },
     },
     callbackUrl: {
       name: 'next-auth.callback-url',
       options: {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax' as const,
         path: '/',
       },
     },
  },

  // Providers
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Validar con esquema Zod
        const validation = LoginSchema.safeParse({
          email: credentials.email,
          password: credentials.password,
        });

        if (!validation.success) {
          return null;
        }

        // Autenticar contra base de datos
        const user = await authenticateUser(
          credentials.email as string,
          credentials.password as string
        );

        return user;
      },
    }),
  ],

  // Callbacks
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },

    async session({ session, token }: any) {
      if ((session as any)?.user) {
        (session as any).user.id = token.id as string;
        (session as any).user.email = token.email as string;
        (session as any).user.name = token.name as string;
        (session as any).user.role = token.role as UserRole;
        (session as any).user.tenantId = token.tenantId as string | undefined;
      }
      return session;
    },

    async redirect({ url, baseUrl }: any) {
      // Permitir redirecciones relativas
      if (url.startsWith('/')) return `${baseUrl}${url}`;

      // Permitir URLs del mismo dominio
      if (new URL(url).origin === baseUrl) return url;

      return baseUrl;
    },
  },

  // Páginas personalizadas
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  // Habilitar debug en desarrollo
  debug: process.env.NODE_ENV === 'development',
};

// Tipos extendidos para NextAuth
declare module 'next-auth' {
  interface User {
    id: string;
    role: UserRole;
    tenantId?: string;
  }

  interface Session {
    user: User;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    tenantId?: string;
  }
}

