import { readFileSync } from "fs-extra";
import path from "path";
import typescript from "typescript";

import { InvalidPathError, TSTranspileError } from "@j.u.p.iter/custom-error";
import { findPathToFile } from "@j.u.p.iter/find-path-to-file";
import { CacheParams, InFilesCache } from "@j.u.p.iter/in-files-cache";
import { SystemErrorCode } from "@j.u.p.iter/system-error-code";

/**
 * To be able to compile as we want it to be, we need to go through initialization step at first:
 * During initialization step we do all necessary setups:
 *
 *   a. Prepare compiler options. Most compiler options come from outside in arguments.
 *      But there're some options we need to setup, because without these options it will
 *      be impossible to achieve the goals we have to achieve with this compiler.
 *
 *   b. Setup source maps. Errors, that happen during compiling step should have readable stack.
 *      For this purpose we use tool, that uses source maps under the hood and shows error stack,
 *      that includes sources from an original file.
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

/**
 * About source maps.
 *
 * Source maps map compiled file to the original file, line by line, character by character.
 *   For example, it says, that charachter 5 on line 2 in the compiled file is represented by a
 *   charachter 10 on line 10 in the original file. Such types of maps allow, for example,
 *   debuger to show the original file, using this map. In another words dubugger, using source maps,
 *   creates representation of the original file. Another use case of source map usage is to show error stack,
 *   based on the code from the original file, instead of the compiled one. Of course it's much easier to find
 *   the error if stack contains original version of code instead of compiled one, that is minified and transpiled.
 *
 * There are three available options to configure ts with sourcemaps:
 *   - the first is the "sourceMap" option. With this option TypeScript will generate mapping files
 *     alongside their corresponding "ts" files. So, if you have "main.ts" file, after the compilation you will have
 *     3 files: "main.ts", "main.js" and "main.js.map". And inside the "main.js" file you will see the URL to the
 *     source map file: //# sourceMappingURL=main.js.map.
 *
 *   - another option is "inlineSourceMap". With this option TypeScript instead of creating a separate file "main.js.map"
 *     will include source maps into the compiled "main.js" file. So, in this case after the compilation we'll have 2 files:
 *     "main.ts" and "main.js". And inside the "main.js" file you'll see the URL to the source map file like this:
 *     //# sourceMappingURL=data:application/json;base64,eyJ2ZXJza... You can use either "sourceMap" option or "inlineSourceMap", but
 *     can not use both.
 *
 *   - another option is "inlineSources". With this option TypeScript will put source code (code from "main.ts" file) into the source maps.
 *     And if you combine "inlineSourceMap" and "inlineSources" options you will get "main.js" file with source maps and with original source code into the source maps.
 *
 * Combination "inlineSourceMap" + "inlineSources" is very powerful.
 *
 * Let's say, we want to get all benefits source maps give us in the production environment. What is the best option to do it?
 * Well, if we have combination: "main.ts"  + "main.js" + "main.js.map" we'll have to server all three files in the production environment
 * to get all benefits. It means, that we will do 3 separate HTTP requests (source maps in the original files requies
 * source map file, and source map file requires original file) and we will need the possibility to server all three types of files.
 *
 * With the "inlineSourceMap" + "inlineSources" combination we'll have compiled code + original code + source maps inside of one file - combiled file "main.js".
 * It means, that in the production environment we'll have only one HTTP request and will have to serve only one type of file, that is always
 * very convenient.
 *
 */

/**
 * Disk cache VS in-memory cache.
 *
 * Disk cache is about storing data in the file system in files
 *
 *   The benefit of such caching mechanism is that data in this case persistent. You can use this case
 *   in different process instances.
 *
 *   The downside of such approach is that it's slow. I/O operations well known as the slowest operations in the computer.
 *   So, to read the data from file you loose in speed and waste additional CPU resources.
 *
 *
 * In-memory cache is about storing data in RAM.
 *
 *   The benefit of such caching is that it's very fast. And you almost don't waste any CPU resources to extract it.
 *
 *   The downside of such approach is that in this case the cached data is bound to the process instance or session, so
 *   it's not persistent.
 *
 * Browser uses cache combination (let's call it like that): "in-memory cache + disk cache":
 *
 * "Memory Cache" stores and loads resources to and from Memory (RAM). So this is much faster but it is non-persistent.
 * Content is available until you close the Browser.
 *
 * "Disk Cache" is persistent. Cached resources are stored and loaded to and from disk.
 *
 * Simple Test: Open Chrome Developper Tools / Network. Reload a page multiple times. The table column "Size" will tell you that some files are loaded "from memory cache".
 * Now close the browser, open Developper Tools / Network again and load that page again. All cached files are loaded "from disk cache" now, because your memory cache is empty.
 *
 * In this module we also use the combination "in-memory cache + disk cache".
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
   *   To prepare compiler options we need to be sure, that we have "inlineSourceMap" + "inlineSources" combination.
   *   The reason, why it's important, is described above.
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
    try {
      const fileContent = readFileSync(filePath, "utf8");

      return fileContent;
    } catch (error) {
      if (error.code === SystemErrorCode.NO_FILE_OR_DIRECTORY) {
        throw new InvalidPathError(filePath, {
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

    if (diagnostics && diagnostics.length) {
      const formattedErrorMessage = this.ts.formatDiagnostics(diagnostics, {
        getNewLine: () => "\n",
        getCurrentDirectory: () => path.dirname(filePath),
        getCanonicalFileName: (fileName: string) => fileName
      });

      throw new TSTranspileError<typescript.Diagnostic[]>(
        formattedErrorMessage,
        filePath,
        diagnostics,
        { context: "@j.u.p.iter/ts-compiler" }
      );
    }

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
      : await this.readFile(resolvedFilePath);

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
   *     Path can be relative to the root folder of the project or an absolute;
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
     * Checks, if there's a compiled version of the file in the cache.
     * And if there's such a version, we return a compiled version.
     * If there's no compiled version, we will compile file further.
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
