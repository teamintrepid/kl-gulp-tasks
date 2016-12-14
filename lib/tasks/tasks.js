/* eslint-disable no-var, prefer-arrow-callback, prefer-template, func-names, vars-on-top */
var env = process.env.NODE_ENV || 'development';
var stopOnErrors = ['production', 'build', 'prepublish'].indexOf(env) !== -1 ||
process.env.CI === '1';
var debug = process.env.DEBUG === '1';
var debugPort = process.env.DEBUG_PORT || '5858';
var defaultDebounce = 5000;

module.exports = function (options) {
  var fs = require('fs');
  if (!options) {
    options = {};
  }
  if (options.watchLinkedModules === undefined) {
    options.watchLinkedModules = true;
  }
  function linkedModulesWatch() {
    var dirs = fs.readdirSync('node_modules');
    var linkedDirs = dirs.filter(function (dir) {
      var stats = fs.lstatSync('node_modules/' + dir);
      return stats.isSymbolicLink();
    }).map(function (dir) {
      return 'node_modules/' + dir + '/lib/**/*.js';
    });
    console.log('Watching linked dirs', linkedDirs);
    return linkedDirs;
  }
  var gulp = options.gulp || require('gulp');
  var clone = require('clone');
  var touchSync = require('touch').sync;
  var babel = require('gulp-babel');
  var istanbul = require('gulp-istanbul');
  var sequence = require('gulp-sequence');
  var newer = require('gulp-newer');
  var spawnMocha = require('gulp-spawn-mocha');
  var inlineMocha = require('gulp-mocha');
  var ts = require('gulp-typescript');
  var clean = require('gulp-clean');
  var sourcemaps = require('gulp-sourcemaps');
  var gulpIf = require('gulp-if');
  var plumber = require('gulp-plumber');
  var notify = require('gulp-notify');
  // var tap = require('gulp-tap');
  var add = require('gulp-add-src');
  var filter = require('gulp-filter');

  var nodemon = require('gulp-nodemon');
  var notifier = require('node-notifier');
  var watch = require('gulp-debounced-watch');
  var merge = require('merge2');
  var remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');

  var otherFiles = 'src/**/!(*.js|*.map|*.src|*.ts|*.d.ts)';
  var source = options.source || 'src/**/*.ts';
  var watchModules = options.watchLinkedModules ? linkedModulesWatch() : [];
  var watchSource = clone(watchModules, false);
  watchSource.push(source);
  var typings = 'typings/index.d.ts';
  var customTypings = 'custom_typings/**/*.d.ts';
  var dest = 'lib';
  var destGlob = dest + '/**/*.*';
  var watchDest = [destGlob];

  // var destGlobJs = dest + '/**/*.js';
  var coveredDest = 'lib_covered';
  var testEndpoint = dest + (options.testEndpoint || '/test/test.js');
  var coveredTestEndpoint = coveredDest + (options.testEndpoint || '/test/test.js');
  var startEndpoint = dest + (options.startEndpoint || '/app.js');
  var touchEndpoint = options.touchEndpoint || startEndpoint;
  var injectedTypescript = options.typescript;
  // var modulesGlob = 'node_modules/**/*.*';

  var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  var packageVersion = packageInfo.name + '@' + packageInfo.version;
  var compileErrors = 0;
  var onError = function (errorCallback) {
    return function (err) {
      if (errorCallback) {
        errorCallback();
      }
      notify.onError({
        title: 'Gulp error in ' + err.plugin,
        message: err.toString(),
      })(err);
      this.emit('end');
    };
  };

  var swallowError = function () {
    this.emit('end');
  };

  gulp.task('cleanup', ['cleanup-dest', 'cleanup-covered', 'cleanup-coverage']);
  gulp.task('cleanup-dest', function () {
    return gulp.src(dest, { read: false }).pipe(clean());
  });
  gulp.task('cleanup-coverage', function () {
    return gulp.src('coverage', { read: false }).pipe(clean());
  });
  gulp.task('cleanup-covered', function () {
    return gulp.src(coveredDest, { read: false }).pipe(clean());
  });
  gulp.task('copy-files', function () {
    return gulp.src(otherFiles)
      .pipe(newer(dest))
      // .pipe(tap(function(file) {
      //     console.log('copy', file.path);
      //  }))
      .pipe(gulp.dest(dest))
      .pipe(gulp.dest(coveredDest));
  });
  gulp.task('ts-definitions', function () {
    var tsProject = ts.createProject('tsconfig.json', { declaration: true, typescript: injectedTypescript });
    var tsResult = gulp.src(source)
      .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: swallowError })))
      .pipe(newer({ dest, ext: '.d.ts' }))
      .pipe(add.prepend(typings))
      .pipe(add.prepend(customTypings))
      .pipe(ts(tsProject));
    return tsResult.dts.pipe(gulp.dest(dest));
  });
  function doJsCompile(covered) {
    compileErrors = 0;
    var checkDest = covered ? coveredDest : dest;
    const noMap = filter('**/!(*.map)', { restore: false });
    // const noTests = filter('**/(!test/**/*.*)', { restore: false });
    var stream = gulp.src(source)
      .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: onError(() => {
        compileErrors++;
      }) })))
      .pipe(newer({ dest: checkDest, ext: '.js' }))
      .pipe(sourcemaps.init())
      .pipe(babel())
      .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
      .pipe(gulp.dest(dest));
    if (covered) {
      stream = stream
        .pipe(noMap)
        // .pipe(noTests)
        .pipe(istanbul())
        .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
        .pipe(gulp.dest('lib_covered'));
    }
    return stream;
  }
  function doTsCompile(covered) {
    compileErrors = 0;
    var checkDest = covered ? coveredDest : dest;
    var noMap = filter('**/!(*.map)', { restore: false });
    // const noTests = filter('**/(!test/**/*.*)', { restore: false });
    var tsProject = ts.createProject('tsconfig.json', {
      isolatedModules: true,
      declaration: false,
      typescript: injectedTypescript,
    });
    var tsResult = gulp.src(source)
      .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: onError(() => {
        compileErrors++;
      }) })))
      .pipe(newer({ dest: checkDest, ext: '.js' }))
      .pipe(sourcemaps.init())
      .pipe(add.prepend(typings))
      .pipe(add.prepend(customTypings))
      .pipe(ts(tsProject));
    var babelStream = tsResult.js.pipe(babel())
      .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
      .pipe(gulp.dest(dest));
    if (covered) {
      babelStream = babelStream
        .pipe(noMap)
        // .pipe(noTests)
        .pipe(istanbul())
        .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
        .pipe(gulp.dest('lib_covered'));
    }
    return merge([
      tsResult.dts
        .pipe(gulp.dest(dest)),
      babelStream,
    ]);
  }
  gulp.task('js-compile', ['copy-files'], function () {
    return doJsCompile(false);
  });
  gulp.task('js-compile-covered', ['copy-files'], function () {
    return doJsCompile(true);
  });
  gulp.task('ts-compile', ['copy-files'], function () {
    return doTsCompile(false);
  });
  gulp.task('ts-compile-covered', ['copy-files'], function () {
    return doTsCompile(true);
  });
  gulp.task('remap-istanbul', function () {
    return gulp.src('coverage/coverage-final.json')
    .pipe(remapIstanbul({
      reports: {
        json: 'coverage/coverage.json',
        html: 'coverage/html-report',
      },
    }));
  });
  gulp.task('test', ['do-test']);
  gulp.task('test-covered', function (callback) {
    return sequence(
      // 'pre-test',
      'do-test-covered',
      'remap-istanbul'
      )(callback);
  });
  function doTest(endpoints) {
    // guard for cases when we don't set env in the calling script
    process.env.NODE_ENV = 'test';
    var errorHappened = false;
    var mocha;
    if (debug) {
      mocha = spawnMocha({
        debugBrk: true,
        env: { NODE_ENV: 'test' },
      });
    } else {
      mocha = inlineMocha({
        reporter: 'mocha-jenkins-reporter',
        reporterOptions: {
          junit_report_name: packageInfo.name,
          junit_report_path: 'tests-xunit.xml',
          junit_report_stack: 1,
        },
      });
    }
    return gulp.src(endpoints, { read: false })
    .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: onError(function () {
      errorHappened = true;
    }) })))
    .pipe(mocha)
    .pipe(istanbul.writeReports({
      reporters: ['json'],
    }))
    .on('end', function () {
      if (!errorHappened && !compileErrors) {
        notifier.notify(
          { title: 'All tests passed in ' + packageInfo.name, message: 'Write some more' }
        );
      }
    });
  }
  gulp.task('do-test', function () {
    return doTest([testEndpoint]);
  });
  gulp.task('do-test-covered', function () {
    return doTest([coveredTestEndpoint]);
  });
  gulp.task('start-watch', function () {
    watch(watchModules, function () {
      touchSync(touchEndpoint, { nocreate: true });
    }, { debounceTimeout: options.debounceTimeout || defaultDebounce });
  });
  gulp.task('start', function () {
    if (debug) {
      nodemon({
        exec: 'node --debug=' + debugPort,
        script: startEndpoint,
        watch: watchDest,
        ignore: ['.git/'],
      });
    } else {
      nodemon({
        script: startEndpoint,
        watch: watchDest,
        ignore: ['.git/'],
      });
    }
  });
  gulp.task('ts-watch-compile', function () {
    gulp.watch(source, ['ts-compile']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-watch-compile-covered', function () {
    gulp.watch(source, ['ts-compile-covered']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('js-watch-compile', function () {
    gulp.watch(source, ['js-compile']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('js-watch-compile-covered', function () {
    gulp.watch(source, ['js-compile-covered']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-watch-test', function () {
    watch(watchSource, function () {
      gulp.start('ts-compile-and-test');
    }, { debounceTimeout: options.debounceTimeout || defaultDebounce });
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-watch-test-covered', function () {
    watch(watchSource, function () {
      gulp.start('ts-compile-and-test-covered');
    }, { debounceTimeout: options.debounceTimeout || defaultDebounce });
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('js-watch-test', function () {
    watch(watchSource, function () {
      gulp.start('js-compile-and-test');
    }, { debounceTimeout: options.debounceTimeout || defaultDebounce });
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('js-watch-test-covered', function () {
    watch(watchSource, function () {
      gulp.start('js-compile-and-test-covered');
    }, { debounceTimeout: options.debounceTimeout || defaultDebounce });
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-compile-and-test', function (callback) {
    sequence('ts-definitions', 'ts-compile', 'test')(callback);
  });
  gulp.task('ts-compile-and-test-covered', function (callback) {
    sequence('ts-definitions', 'ts-compile-covered', 'test-covered')(callback);
  });
  gulp.task('js-compile-and-test', function (callback) {
    sequence('js-compile', 'test')(callback);
  });
  gulp.task('js-compile-and-test-covered', function (callback) {
    sequence('js-compile-covered', 'test-covered')(callback);
  });
  gulp.task('ts-fresh-compile', function (callback) {
    sequence('cleanup', 'ts-definitions', 'ts-compile')(callback);
  });
  gulp.task('ts-fresh-compile-covered', function (callback) {
    sequence('cleanup', 'ts-definitions', 'ts-compile-covered')(callback);
  });
  gulp.task('js-fresh-compile', function (callback) {
    sequence('cleanup', 'js-compile')(callback);
  });
  gulp.task('js-fresh-compile-covered', function (callback) {
    sequence('cleanup', 'js-compile-covered')(callback);
  });
  gulp.task('ts-run-build', function (callback) {
    sequence('ts-fresh-compile', 'ts-watch-compile')(callback);
  });
  gulp.task('ts-run-build-covered', function (callback) {
    sequence('ts-fresh-compile-covered', 'ts-watch-compile-covered')(callback);
  });
  gulp.task('js-run-build', function (callback) {
    sequence('js-fresh-compile', 'js-watch-compile')(callback);
  });
  gulp.task('js-run-build-covered', function (callback) {
    sequence('js-fresh-compile-covered', 'js-watch-compile-covered')(callback);
  });
  gulp.task('ts-run-test', function (callback) {
    sequence('ts-run-build', 'ts-watch-test', 'test')(callback);
  });
  gulp.task('ts-run-test-covered', function (callback) {
    sequence('ts-run-build-covered', 'ts-watch-test-covered', 'test-covered')(callback);
  });
  gulp.task('js-run-test', function (callback) {
    sequence('js-run-build', 'js-watch-test', 'test')(callback);
  });
  gulp.task('js-run-test-covered', function (callback) {
    sequence('js-run-build-covered', 'js-watch-test-covered', 'test-covered')(callback);
  });
  gulp.task('ts-run', function (callback) {
    sequence('ts-compile', 'ts-watch-compile', 'start-watch', 'start')(callback);
  });
  gulp.task('js-run', function (callback) {
    sequence('js-compile', 'js-watch-compile', 'start-watch', 'start')(callback);
  });
};
