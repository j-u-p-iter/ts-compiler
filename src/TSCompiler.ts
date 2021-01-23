import { findPathToFile } from "@j.u.p.iter/find-path-to-file";
import { CacheParams, InFilesCache } from '@j.u.p.iter/in-files-cache';

export class TSCompiler {
  private appRootPath = null;

  private cacheFolderPath = null;

  private cache = null;

  private async getAppRootFolderPath() {
    if (this.appRootPath) {
      return this.appRootPath;
    }

    const { dirPath } = await findPathToFile("package.json");

    this.appRootPath = dirPath;

    return this.appRootPath;
  }

  private prepareCompilerOptions() {

  }

  private compileTSFile(filePath, codeToCompile) {

  }

  private setupSourceMaps() {

  }

  private async initCache() {
    if (!this.cache) {
      this.cache = new InFilesCache(this.cacheFolderPath);
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

  private async getCacheParams(filePath: string, codeToCompile?: string): Promise<CacheParams>  {
    const appRootFolderPath = await this.getAppRootFolderPath();
    const relativePathToFile = await this.absolutePathToRelative(filePath); 
    const fullPathToFile = path.resolve(appRootFolderPath, relativePathToFile);

    const fileContent = codeToCompile 
      ? codeToCompile
      : readFileSync(fullPathToFile);

    return {
      fileContent,
      filePath: fullPathToFile,
      fileExtension: '.js',
    };
  }
  
  constructor(options: { 
    cacheFolderPath: string; 
    compilerOptions: any;
  }) {
    this.cacheFolderPath = options.cacheFolderPath;
  }

  public async compile({ params: { 
    filePath: string, 
    codeToCompile?: string 
  }) {
    await this.initCache();

    const cacheParams = await this.getCacheParams(filePath, codeToCompile);

    const compiledCodeFromCache = this.cache.get(cacheParams);

    if (compiledCodeFromCache) { 
      return compiledCodeFromCache; 
    }

    const compiledCode = this.compileTSFile(filePath, codeToCompile);

    this.cache.set(cacheParams, compiledCode);

    return compiledCode;
  }
}
