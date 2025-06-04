#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { getSchema } from './xcjson.js';
import { initializeValidator } from './validator.js';
import { parseXCResult } from './parser.js';

interface CLIOptions {
  path: string;
  pretty: boolean;
  'fail-fast': boolean;
  schema: boolean;
}

async function printSchema(): Promise<void> {
  try {
    const schema = await getSchema('tests');
    console.log(JSON.stringify(schema, null, 2));
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(2);
  }
}

async function processXCResult(options: CLIOptions): Promise<void> {
  try {
    // Initialize validator
    await initializeValidator();

    // Parse xcresult
    const report = await parseXCResult(options.path);

    // Output JSON
    const jsonOutput = options.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);

    console.log(jsonOutput);

    // Exit with appropriate code
    const hasFailures = report.suites.some((suite) => suite.failed.length > 0);

    if (hasFailures && options['fail-fast']) {
      process.exit(10);
    } else if (hasFailures) {
      process.exit(10);
    } else {
      process.exit(0);
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(error.code === 'INVALID_BUNDLE' ? 2 : 1);
  }
}

async function main() {
  const argv = (await yargs(hideBin(process.argv))
    .usage('Usage: $0 --path <bundle> [options]')
    .option('path', {
      describe: 'Path to .xcresult bundle',
      type: 'string',
      demandOption: false,
    })
    .option('pretty', {
      describe: 'Pretty-print JSON output',
      type: 'boolean',
      default: false,
    })
    .option('fail-fast', {
      describe: 'Exit with code 10 on first failure',
      type: 'boolean',
      default: false,
    })
    .option('schema', {
      describe: 'Print live JSON-Schema and exit',
      type: 'boolean',
      default: false,
    })
    .check((argv) => {
      if (!argv.schema && !argv.path) {
        throw new Error('--path is required unless using --schema');
      }
      return true;
    })
    .help()
    .version()
    .parse()) as CLIOptions;

  if (argv.schema) {
    await printSchema();
  } else {
    await processXCResult(argv);
  }
}

main().catch((error) => {
  console.error(chalk.red(`Unexpected error: ${error.message}`));
  process.exit(1);
});
