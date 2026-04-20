
/**
 * Interfaz que define un caso de uso
 * Todos los casos de uso deben tener un método execute
 */
export interface UseCase<I, O> {
  execute(input: I): Promise<O>;
}
