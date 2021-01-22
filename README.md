# ts-compiler

1. Set up options on class create
2. Set up https://github.com/evanw/node-source-map-support on class create
3. Compile on compile method call.
4. Compile with TS api: this.ts.transpileModule
5. Cache with in-files-cache + in memory.

## Force some compiler options on class initialization step:


/**
 * Source maps map compiled file to the original file. For example, it says, that charachter 5 on line 2 in the compiled file is represented by a charachter 10 on line 10 in     * the original file. Such types of maps allow, for example, debuger to show the original file, using this map. In another words dubugger, using source maps, creates representation of the original file.

 * There are two possible ways of configuring ts with sourcemaps:
 *   - sourceMap - this is the way to tell TS to emit source maps in the separate files 
 *     alongside their corresponding ts files. In this case  To let a debugger or any another client, that uses source map, knowledge about this source map,
       the link to the generated source maps will be placed into the compiled files. Example of such a link can look like this: `//# sourceMappingURL=main.js.map`.
 *   - inlineSourceMap
 */
`inlineSourceMap` to true;



