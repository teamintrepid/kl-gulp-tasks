# Gentlemen's gulp task kit
A set of gulp tasks that simplify development environment for ES6-7 and Typescript.
This is rather opinionated set of tasks that significantly speeds up the development at Kent and Lime.

At Kent and Lime we have many micro services and 20+ different modules those services depend on. 
Module development was very time consuming because in order to test how the changes we just made in sub-sub dependency
would affect application, we had to recompile the module from scratch and `npm install` it to the app, then restart the app itself.
This set of tasks made our development environment much more comfortable allowing us to spend more time perfecting our product.

## Features:
* incremental compilation for pipeline Typescript -> ES6 -> ES5 or ES7 -> ES5: now you don't have to wait until the project compiles again after that tiny fix you made.
* end to end source mapping: now your stack traces will point to the source code.
* `npm link` support for dependent modules autodiscovery: e.g. your dev server will be relaunched automatically if some if it's dependencies have been updated and recompiled.
* TDD mode: re-running compiled tests each time something has changed in the project source files or one of the dependent modules installed via `npm link`
* Source code coverage: get the real coverage information remapped to your source code.

## Current limitations
* Only Mocha test runner is supported
* Only Istanbul coverage provider is supported
* Built-in Typescript (1.8.10) compiler is used
* Mixed source (e.g. Typescript + ES7) projects are **not supported**

## Getting started
1. `npm install gulp kl-gulp-tasks --save-dev`
2. create a file `gulpfile.js` at the project root
  * for ES6/ES7 projects
  ```javascript
require('kal-dep-gulp-tasks').loadTasks(
  {
    // application start point (optional)
    startEndpoint: '/server.js',
    // test endpoint, relative to compiled project destination (./lib)
    testEndpoint: '/test/index.js',
    // source glob to watch and compile
    source: 'src/**/*.js',
  }); 
```
  * for Typescript projects
  ```javascript
require('kal-dep-gulp-tasks').loadTasks(
  {
    // application start point (optional)
    startEndpoint: '/server.js',
    // test endpoint, relative to compiled project destination (./lib)
    testEndpoint: '/test/index.js',
    // source glob to watch and compile
    source: 'src/**/*.ts',
  }); 
```
3. Start your Typescript or ES7 incremental compilation `gulp js-run-build`

## Main tasks:
* Incremental compilation: **js-run-build** for ES6/7  or **ts-run-build** for Typescript
  1. cleans up the project destination
  2. compiles the project
  3. watches for the changes
  4. compiles changes incrementally
* Incremental compilation + tests: **js-run-test** for ES6/7  or **ts-run-test** for Typescript
  1. cleans up the project destination
  2. compiles the project
  3. runs tests
  4. watches for the changes in the source or linked modules
  5. compiles changes incrementally and reruns the tests if source or linked modules changed
* Incremental compilation + app running: **js-run** for ES6/7  or **ts-run** for Typescript
  1. cleans up the project destination
  2. compiles the project
  3. runs the application
  4. watches for the changes in the source or linked modules
  5. compiles changes incrementally and restarts the application if source or linked modules changed
* for the complete task list run `gulp --tasks`

Suggestions & PRs are very welcome.
