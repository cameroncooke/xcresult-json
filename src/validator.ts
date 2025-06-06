import Ajv from 'ajv';
import chalk from 'chalk';
import { getLiveSchema } from './schema.js';

const ajv = new Ajv({ strict: false, allErrors: true });

interface ValidationResult {
  valid: boolean;
  errors?: any[];
}

let compiledValidator: any = null;

export async function initializeValidator(): Promise<void> {
  if (compiledValidator) return;

  try {
    const schema = await getLiveSchema();
    compiledValidator = ajv.compile(schema);
    console.error(chalk.green('Schema validation enabled'));
  } catch (error: any) {
    console.error(chalk.yellow(`Warning: Failed to initialize validator: ${error.message}`));
    console.error(chalk.yellow('Continuing without validation...'));
    // Continue without validation in case of schema issues
  }
}

export function validate(data: any): ValidationResult {
  if (!compiledValidator) {
    // If validator isn't initialized, pass through
    return { valid: true };
  }

  const valid = compiledValidator(data);

  if (!valid) {
    console.error(chalk.yellow('Warning: JSON payload does not match schema'));
    if (compiledValidator.errors) {
      console.error(chalk.yellow('Validation errors:'), compiledValidator.errors);
    }
  }

  return {
    valid,
    errors: compiledValidator.errors || undefined,
  };
}

export function validateAndLog(data: any, context: string): any {
  const result = validate(data);

  if (!result.valid) {
    console.error(chalk.yellow(`Schema validation failed for ${context}`));
    // Continue processing despite validation errors for forward compatibility
  }

  return data;
}

// Test utility to reset validator state
export function resetValidator(): void {
  compiledValidator = null;
}
