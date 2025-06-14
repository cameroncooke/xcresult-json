#!/usr/bin/env tsx
import { compile } from 'json-schema-to-typescript';
import { promises as fs } from 'fs';
import path from 'path';
import { getSchema } from '../src/xcjson.js';

async function generateTypes() {
  try {
    console.log('Fetching schema from xcresulttool...');
    const schema = await getSchema('tests');
    
    // Save schema
    const schemaPath = path.join(process.cwd(), 'src', 'schema', 'tests.json');
    await fs.mkdir(path.dirname(schemaPath), { recursive: true });
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
    console.log(`Schema saved to ${schemaPath}`);
    
    // Generate TypeScript types
    console.log('Generating TypeScript types...');
    const ts = await compile(schema, 'XCResultTypes', {
      bannerComment: '/* tslint:disable */\n/**\n * This file was automatically generated by json-schema-to-typescript.\n * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,\n * and run npm run build:types to regenerate this file.\n */',
      style: {
        singleQuote: true,
      },
    });
    
    const typesPath = path.join(process.cwd(), 'src', 'types', 'xcresult-tests.d.ts');
    await fs.writeFile(typesPath, ts);
    console.log(`Types generated at ${typesPath}`);
  } catch (error: any) {
    console.error('Failed to generate types:', error.message);
    process.exit(1);
  }
}

generateTypes();