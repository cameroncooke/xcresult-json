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
  } catch (error: any) {
    console.warn(chalk.yellow(`Warning: Failed to initialize validator: ${error.message}`));
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
    console.warn(chalk.yellow('Warning: JSON payload does not match schema'));
    if (compiledValidator.errors) {
      console.warn(chalk.yellow('Validation errors:'), compiledValidator.errors);
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
    console.warn(chalk.yellow(`Schema validation failed for ${context}`));
    // Continue processing despite validation errors for forward compatibility
  }

  return data;
}
