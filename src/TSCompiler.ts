import { readFileSync } from "fs-extra";
import path from "path";
import typescript from "typescript";

import { findPathToFile } from "@j.u.p.iter/find-path-to-file";
import { CacheParams, InFilesCache } from "@j.u.p.iter/in-files-cache";

/**
 * To be able to compile as we want it to be, we need to go through initialization step at first:
 * During initialization step we do all necessary setups:
 *
 *     a. Prepare compiler options. Most compiler options come from outside in arguments.
 *        But there're some options we need to setup, because without this options it will
 *        be impossible to achieve the goals we have to achieve with this compiler.
 *
 *     b. Setup source maps. Errors, that happen during compiling step should have readable stack.
 *        For this purpose we use tool, that uses source maps under the hood and shows error stack,
 *        that includes sources from an original file.
 *
 * Compiling process itself starts on "compile" method call and consists on several phases:
 *
 *   - cache initialization. We want to be able not to recompile something we've already compiled previously.
 *     And if the path of the file and content of the file are the same, we want to extract the compiled version
 *     of the file from a cache. For this purpose we need the cache.
 *
 *   - check, if there's a compiled version of the file in the cache. And if there's such a version, we return
 *     compiled version. If there's no compiled version, we continue further.
 *
 *   - compilation phase itself. Here we compile code, using TypeScript API method.
 *
 *   - cache compiled data on the disk and return compiled data.
 *
 */

export class TSCompiler {
  private compilerOptions: typescript.CompilerOptions | null = null;

  private appRootPath = null;

  private cacheFolderPath = null;

  private diskCache = null;

  private ts: typeof typescript | null = null;

  private async getAppRootFolderPath() {
    if (this.appRootPath) {
      return this.appRootPath;
    }

    const { dirPath } = await findPathToFile("package.json");

    this.appRootPath = dirPath;

    return this.appRootPath;
  }

  private prepareCompilerOptions(compilerOptions: typescript.CompilerOptions) {
    return compilerOptions;
  }

  private compileTSFile(codeToCompile) {
    const { diagnostics, outputText } = this.ts.transpileModule(codeToCompile, {
      compilerOptions: this.compilerOptions,
      reportDiagnostics: true
    });

    console.log(diagnostics);

    return outputText;
  }

  // private setupSourceMaps() {

  // }

  private async initCache() {
    if (!this.diskCache) {
      this.diskCache = new InFilesCache(this.cacheFolderPath);
    }
  }

  /**
   * File path can be either absolute or relative
   *   (relative to the app root folder).
   *
   * We need to make it relative if it's absolute, to be
   *   able to work with this in a consistent way.
   *
   */
  private async absolutePathToRelative(pathToModify) {
    const appRootFolderPath = await this.getAppRootFolderPath();

    /**
     * appRootFolderPath is always an absolute path.
     *   If pathToModify is also an absolute,
     *   we get the relative path to the app root folder in the end.
     *
     */
    return pathToModify.replace(appRootFolderPath, "");
  }

  private async getCacheParams(
    filePath: string,
    codeToCompile?: string
  ): Promise<CacheParams> {
    const appRootFolderPath = await this.getAppRootFolderPath();
    const relativePathToFile = await this.absolutePathToRelative(filePath);
    const fullPathToFile = path.resolve(appRootFolderPath, relativePathToFile);

    const fileContent = codeToCompile
      ? codeToCompile
      : readFileSync(fullPathToFile);

    return {
      fileContent,
      filePath: fullPathToFile,
      fileExtension: ".js"
    };
  }

  /**
   * Options description:
   *
   *   - ts - typescript instance. We pass typescript instance using Dependency Injection pattern
   *     no to be bound on a concrete version of TS;
   *
   *   - configPath - path to the typescript config;
   *
   *   - cacheFolderPath - path to the cache folder. We store a parsed version of the config in the cache;
   *
   *   - compilerOptions - typescript options to compile with.
   */
  constructor(options: {
    ts: typeof typescript;
    cacheFolderPath: string;
    compilerOptions: typescript.CompilerOptions;
  }) {
    this.cacheFolderPath = options.cacheFolderPath;
    this.ts = options.ts;
    this.compilerOptions = this.prepareCompilerOptions(options.compilerOptions);
  }

  public async compile(filePath: string, codeToCompile?: string) {
    await this.initCache();

    const cacheParams = await this.getCacheParams(filePath, codeToCompile);

    const compiledCodeFromCache = await this.diskCache.get(cacheParams);

    if (compiledCodeFromCache) {
      return compiledCodeFromCache;
    }

    const compiledCode = this.compileTSFile(codeToCompile);

    this.diskCache.set(cacheParams, compiledCode);

    return compiledCode;
  }
}
