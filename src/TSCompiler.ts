import { readFileSync } from "fs-extra";
import path from "path";
import typescript from "typescript";

import { InvalidPathError } from "@j.u.p.iter/custom-error";
import { findPathToFile } from "@j.u.p.iter/find-path-to-file";
import { CacheParams, InFilesCache } from "@j.u.p.iter/in-files-cache";
import { SystemErrorCode } from "@j.u.p.iter/system-error-code";

/**
 * To be able to compile as we want it to be, we need to go through initialization step at first:
 * During initialization step we do all necessary setups:
 *
 *     a. Prepare compiler options. Most compiler options come from outside in arguments.
 *        But there're some options we need to setup, because without these options it will
 *        be impossible to achieve the goals we have to achieve with this compiler.
 *
 *     b. Setup source maps. Errors, that happen during compiling step should have readable stack.
 *        For this purpose we use tool, that uses source maps under the hood and shows error stack,
 *        that includes sources from an original file.
 */

/**
 * The class supposes to work with two different types of files.
 *
 * The first type is called "virtual". This is the type, that doesn't present
 *   in the file system and content for this file comes from user's input (for example, from repl).
 *   In this case we still need some file path (let's say file id) to create reasonable file path
 *   for the file with cache. So, the user of this class still need to pass some file path for
 *   the content we want to cache.
 *
 * The second type is called "real". This is the type, that really presents in the file system.
 *   In this case we don't provide file's content to the "compile" method. The class tries to read
 *   this content internally.
 *
 * So, one more time:
 *   - for the "virtual" types of files we should provide both file path and
 *     file content params to generate correct file path to the result file with cache;
 *
 *   - for the "real" types of files we should provide only file path, because the
 *     content will be read by the system internally.
 *
 */

export class TSCompiler {
  /**
   * Stores prepared compiler options.
   *   Compiler options are prepared during initialization phase
   *   with help of "prepareCompilerOptions".
   *
   */
  private compilerOptions: typescript.CompilerOptions | null = null;

  /**
   * An absolute path to the root project folder.
   */
  private appRootPath = null;

  /**
   * A path to the cache folder.
   */
  private cacheFolderPath = null;

  /**
   * Cache instance that is used to store compiled code in the cache.
   *
   */
  private diskCache = null;

  /**
   * TypeScript instance, passed during initialization phase.
   *   It's necessary to pass it with props not to be bound
   *   to one concrete version of TS.
   */
  private ts: typeof typescript | null = null;

  /**
   * Detects the root path to the project by location of
   *   the "package.json" file internally.
   *
   */
  private async getAppRootFolderPath() {
    if (this.appRootPath) {
      return this.appRootPath;
    }

    const { dirPath } = await findPathToFile("package.json");

    this.appRootPath = dirPath;

    return this.appRootPath;
  }

  /**
   * Prepare compiler options.
   *
   */
  private prepareCompilerOptions(compilerOptions: typescript.CompilerOptions) {
    return compilerOptions;
  }

  /**
   * We read the config's raw content to use the content in the InFilesCache.
   *   The presence of the config is the mandatory requirement. So, if there's no
   *   the such a file in the application we throw an appropriate error.
   *
   */
  private async readFile(filePath: string): Promise<string | null> {
    const resolvedFilePath = await this.resolvePathToFile(filePath);

    try {
      const fileContent = readFileSync(resolvedFilePath, "utf8");

      return fileContent;
    } catch (error) {
      if (error.code === SystemErrorCode.NO_FILE_OR_DIRECTORY) {
        throw new InvalidPathError(resolvedFilePath, {
          context: "@j.u.p.iter/ts-compiler"
        });
      }

      throw error;
    }
  }

  /**
   * Compiles typescript file.
   *   For this purpose we use "transpileModule" method from TypeScript API.
   *
   */
  private async compileTSFile(
    filePath: string,
    codeToCompile?: string
  ): Promise<string> {
    const resultCodeToCompile = codeToCompile
      ? codeToCompile
      : await this.readFile(filePath);
    const { diagnostics, outputText } = this.ts.transpileModule(
      resultCodeToCompile,
      {
        compilerOptions: this.compilerOptions,
        reportDiagnostics: true
      }
    );

    console.log(diagnostics);

    return outputText;
  }

  // private setupSourceMaps() {

  // }

  /**
   * Initialize cache instance and store it in an appropriate property.
   *
   */
  private async initCache() {
    if (!this.diskCache) {
      this.diskCache = new InFilesCache(this.cacheFolderPath);
    }
  }

  /**
   * File path can be either absolute or relative
   *   (relative to the app root folder).
   *
   * We need to make it relative if it's an absolute, to be
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

  /**
   * The file path should be relative to the app's root folder.
   *   Here we create an absolute path to the config to make it
   *   univeral and independent from the file location, that uses
   *   this path.
   *
   */
  private async resolvePathToFile(originalFilePath: string): Promise<string> {
    const appRootFolderPath = await this.getAppRootFolderPath();
    const relativePathToFile = await this.absolutePathToRelative(
      originalFilePath
    );

    return path.resolve(appRootFolderPath, relativePathToFile);
  }

  private async getCacheParams(
    filePath: string,
    codeToCompile?: string
  ): Promise<CacheParams> {
    const resolvedFilePath = await this.resolvePathToFile(filePath);

    const fileContent = codeToCompile
      ? codeToCompile
      : readFileSync(resolvedFilePath);

    return {
      fileContent,
      fileExtension: ".js",
      filePath: resolvedFilePath
    };
  }

  /**
   * Initialization options:
   *   - ts - typescript instance. We pass typescript instance using Dependency Injection pattern
   *     no to be bound on a concrete version of TS;
   *
   *   - cacheFolderPath - path to the cache folder. We store a parsed version of the config in the cache.
   *     Path can be relative to the root folder of the project or an absolute.
   *
   *   - compilerOptions - typescript options to compile with.
   *
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
    /**
     * Cache initialization. We want to be able not to recompile something we've already compiled previously.
     *   And if the path of the file and content of the file are the same, we want to extract the compiled version
     *   of the file from a cache. For this purpose we need the cache.
     *
     */

    await this.initCache();

    const cacheParams = await this.getCacheParams(filePath, codeToCompile);

    const compiledCodeFromCache = await this.diskCache.get(cacheParams);

    /**
     * Checks, if there's a compiled version of the file in the cache. And if there's such a version, we return
     * a compiled version. If there's no compiled version, we will compile file further.
     *
     */
    if (compiledCodeFromCache) {
      return compiledCodeFromCache;
    }

    /**
     * Compilation phase itself. Here we compile code, using TypeScript API method.
     *
     */
    const compiledCode = await this.compileTSFile(filePath, codeToCompile);

    /**
     * Store on the disk compiled code.
     *
     */
    await this.diskCache.set(cacheParams, compiledCode);

    /**
     * Returns newly compiled data.
     *
     */
    return compiledCode;
  }
}
