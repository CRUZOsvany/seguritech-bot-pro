import { Bootstrap } from './Bootstrap';

/**
 * Punto de entrada de la aplicación
 * Aquí comienza todo
 */
async function main(): Promise<void> {
  const bootstrap = new Bootstrap();
  await bootstrap.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
