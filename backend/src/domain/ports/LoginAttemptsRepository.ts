/**
 * Histórico de intentos de login para lockout (5 fallos en X minutos = bloqueo).
 */
export interface LoginAttemptsRepository {
  record(input: { email: string; ip: string; success: boolean }): Promise<void>;

  /**
   * Cuenta fallos para un email en los últimos `windowMinutes` minutos.
   * Los intentos exitosos NO cuentan (reseteamos la "ventana" cuando hay éxito).
   */
  countFailed(email: string, windowMinutes: number): Promise<number>;
}
