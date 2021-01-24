import * as ts from 'typescript';
import path from 'path';
import { pathExists, removeSync } from 'fs-extra';

import { TSCompiler } from './TSCompiler';


const CACHE_FOLDER_NAME = 'cache'; 
const cacheFolderPath = path.resolve(__dirname, CACHE_FOLDER_NAME);

const codeSnippet = `
  const func = (param: string): string => {
    return param;
  }
`;

const codeSnippetToArray = (codeSnippet) => codeSnippet.split('\n').map((lineOfCode) => lineOfCode.trim()); 


describe('TSCompiler', () => {
  beforeEach(() => {
    removeSync(cacheFolderPath) 
  });

  it('compiles code and creates cache file on a disk with compiled version', async () => {
    const tsCompiler = new TSCompiler({ 
      ts, 
      cacheFolderPath,
      compilerOptions: {}, 
    });

    await expect(pathExists(cacheFolderPath)).resolves.toBe(false);

    const result = await tsCompiler.compile(
      'fileName.ts',
      codeSnippet
    );

    await expect(pathExists(cacheFolderPath)).resolves.toBe(true);

    expect(codeSnippetToArray(result)).toEqual(
      codeSnippetToArray(`var func = function (param) {
          return param;
        };
      `)
    );

  });
})
