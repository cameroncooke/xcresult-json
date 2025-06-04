import { promises as fs } from 'fs';
import path from 'path';
import { getSchema } from './xcjson.js';

const SCHEMA_DIR = path.join(process.cwd(), 'src', 'schema');
const SCHEMA_FILE = path.join(SCHEMA_DIR, 'tests.json');

export async function fetchAndSaveSchema(): Promise<void> {
  try {
    // Ensure schema directory exists
    await fs.mkdir(SCHEMA_DIR, { recursive: true });

    // Fetch schema from xcresulttool
    const schema = await getSchema('tests');

    // Save to file
    await fs.writeFile(SCHEMA_FILE, JSON.stringify(schema, null, 2));
    console.log(`Schema saved to ${SCHEMA_FILE}`);
  } catch (error: any) {
    console.error('Failed to fetch and save schema:', error.message);
    throw error;
  }
}

export async function loadSchema(): Promise<any> {
  try {
    // Try to load from file first
    const schemaContent = await fs.readFile(SCHEMA_FILE, 'utf-8');
    return JSON.parse(schemaContent);
  } catch {
    // If file doesn't exist, fetch it
    console.log('Schema file not found, fetching from xcresulttool...');
    await fetchAndSaveSchema();
    const schemaContent = await fs.readFile(SCHEMA_FILE, 'utf-8');
    return JSON.parse(schemaContent);
  }
}

export async function getLiveSchema(): Promise<any> {
  try {
    return await getSchema('tests');
  } catch (error: any) {
    console.warn('Failed to get live schema, falling back to cached version:', error.message);
    return await loadSchema();
  }
}
