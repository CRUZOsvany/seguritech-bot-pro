/**
 * Test Visualization Helpers
 * Proporciona funciones para imprimir tests de manera visual y clara
 */

// Colores ANSI para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  white: '\x1b[37m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

// Símbolos
const symbols = {
  success: '✅',
  failure: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  arrow: '►',
  box: '□',
  check: '✔',
  cross: '✕',
  star: '★',
  dot: '●',
  dash: '─',
  pipe: '│',
};

/**
 * Imprime un encabezado de prueba detallado
 */
export function printTestHeader(title: string, description?: string): void {
  console.log('\n');
  console.log(
    `${colors.bright}${colors.blue}${'═'.repeat(80)}${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.blue}║${colors.reset} ${colors.bright}${colors.cyan}${symbols.star} ${title}${colors.reset}`
  );
  if (description) {
    console.log(
      `${colors.bright}${colors.blue}║${colors.reset} ${colors.dim}${description}${colors.reset}`
    );
  }
  console.log(
    `${colors.bright}${colors.blue}${'═'.repeat(80)}${colors.reset}`
  );
}

/**
 * Imprime el resultado de una prueba individual
 */
export function printTestResult(
  name: string,
  passed: boolean,
  details?: string
): void {
  const symbol = passed ? symbols.success : symbols.failure;
  const color = passed ? colors.green : colors.red;
  const status = passed ? 'PASS' : 'FAIL';

  console.log(
    `${symbol}  ${colors.bright}${color}${status}${colors.reset} ${colors.white}${name}${colors.reset}`
  );

  if (details) {
    console.log(
      `${colors.dim}   ${symbols.arrow} ${details}${colors.reset}`
    );
  }
}

/**
 * Imprime un escenario de test
 */
export function printScenario(
  scenarioNum: number,
  scenarioName: string,
  tenantId: string,
  phoneNumber: string,
  message: string
): void {
  console.log('\n');
  console.log(
    `${colors.bright}${colors.yellow}${symbols.dot} Escenario ${scenarioNum}: ${scenarioName}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Tenant${colors.reset}:       ${colors.bright}${tenantId}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Teléfono${colors.reset}:      ${colors.bright}${phoneNumber}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Mensaje${colors.reset}:      ${colors.bright}"${message}"${colors.reset}`
  );
}

/**
 * Imprime los datos recuperados de la BD para comparación
 */
export function printDatabaseState(
  label: string,
  tenantId: string,
  phoneNumber: string,
  state: string
): void {
  console.log(
    `   ${colors.dim}${symbols.box} [BD] ${label}: tenant="${tenantId}", phone="${phoneNumber}" --> state="${colors.bright}${state}${colors.dim}"${colors.reset}`
  );
}

/**
 * Imprime una comparación de estados (para verificar aislamiento)
 */
export function printIsolationCheck(
  phoneNumber: string,
  tenant1: string,
  state1: string,
  tenant2: string,
  state2: string,
  isIsolated: boolean
): void {
  const symbol = isIsolated ? symbols.success : symbols.failure;
  console.log('\n');
  console.log(
    `${symbol}  ${colors.bright}Verificación de Aislamiento Multi-Tenant${colors.reset}`
  );
  console.log(
    `${colors.dim}   Mismo número: ${colors.bright}${phoneNumber}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}${tenant1}${colors.reset}: estado = ${colors.green}"${state1}"${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}${tenant2}${colors.reset}: estado = ${colors.green}"${state2}"${colors.reset}`
  );

  if (isIsolated) {
    console.log(
      `${colors.dim}   ✔ Estados completamente aislados (SIN mezcla de datos)${colors.reset}`
    );
  } else {
    console.log(
      `${colors.red}   ✕ ¡ERROR! Los estados están mezclados (FALLO DE AISLAMIENTO)${colors.reset}`
    );
  }
}

/**
 * Imprime un resumen final de las pruebas
 */
export function printTestSummary(
  totalTests: number,
  passed: number,
  failed: number,
  duration: number
): void {
  const percentage = ((passed / totalTests) * 100).toFixed(2);
  const statusSymbol = failed === 0 ? symbols.success : symbols.failure;
  const statusColor = failed === 0 ? colors.green : colors.red;

  console.log('\n');
  console.log(
    `${colors.bright}${colors.blue}${'═'.repeat(80)}${colors.reset}`
  );
  console.log(
    `${statusSymbol}  ${colors.bright}${statusColor}RESUMEN DE PRUEBAS${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.blue}${'═'.repeat(80)}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Total${colors.reset}:      ${colors.bright}${totalTests}${colors.reset}`
  );
  console.log(
    `   ${colors.green}Pasadas${colors.reset}:     ${colors.bright}${colors.green}${passed}${colors.reset}`
  );
  console.log(
    `   ${colors.red}Fallidas${colors.reset}:     ${colors.bright}${colors.red}${failed}${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Éxito${colors.reset}:      ${colors.bright}${statusColor}${percentage}%${colors.reset}`
  );
  console.log(
    `   ${colors.cyan}Tiempo${colors.reset}:      ${colors.bright}${duration}ms${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.blue}${'═'.repeat(80)}${colors.reset}\n`
  );
}

/**
 * Imprime un error con contexto
 */
export function printError(title: string, error: any): void {
  console.log(
    `${symbols.failure}  ${colors.bright}${colors.red}ERROR: ${title}${colors.reset}`
  );
  if (error instanceof Error) {
    console.log(
      `${colors.dim}   ${error.message}${colors.reset}`
    );
    if (error.stack) {
      console.log(
        `${colors.dim}${error.stack
          .split('\n')
          .slice(1)
          .join('\n   ')}${colors.reset}`
      );
    }
  } else {
    console.log(`${colors.dim}   ${JSON.stringify(error, null, 2)}${colors.reset}`);
  }
}

/**
 * Imprime información general
 */
export function printInfo(message: string, data?: any): void {
  console.log(`${symbols.info}  ${colors.cyan}${message}${colors.reset}`);
  if (data) {
    console.log(`${colors.dim}${JSON.stringify(data, null, 2)}${colors.reset}`);
  }
}

/**
 * Imprime una tabla de datos
 */
export function printTable(title: string, data: any[]): void {
  console.log(
    `\n${colors.bright}${colors.cyan}${title}${colors.reset}`
  );
  if (data.length === 0) {
    console.log(`${colors.dim}(vacío)${colors.reset}`);
    return;
  }

  const headers = Object.keys(data[0]);
  const colWidths = headers.map((h) =>
    Math.max(h.length, ...data.map((r) => String(r[h]).length))
  );

  // Encabezado
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]))
    .join(' │ ');
  console.log(`${colors.cyan}${headerLine}${colors.reset}`);
  console.log(
    `${colors.dim}${headers.map((_, i) => '─'.repeat(colWidths[i])).join('─┼─')}${colors.reset}`
  );

  // Datos
  data.forEach((row) => {
    const rowLine = headers.map((h, i) => String(row[h]).padEnd(colWidths[i])).join(' │ ');
    console.log(`${colors.white}${rowLine}${colors.reset}`);
  });
}

