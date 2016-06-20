/* eslint-disable no-var, prefer-arrow-callback, prefer-template, func-names, vars-on-top */
var env = process.env.NODE_ENV || 'development';
var stopOnErrors = ['production', 'build', 'prepublish'].indexOf(env) !== -1;
var debug = process.env.DEBUG === 1;
module.exports = function (options) {
  var fs = require('fs');
  if (!options) {
    options = {};
  }
  var gulp = options.gulp || require('gulp');
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
  // var inspector = require('gulp-node-inspector');
  var filter = require('gulp-filter');

  var nodemon = require('gulp-nodemon');
  var notifier = require('node-notifier');
  var merge = require('merge2');
  var remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');

  var otherFiles = 'src/**/!(*.js|*.map|*.src|*.ts|*.d.ts)';
  var source = 'src/**/*.ts';
  var typings = 'typings/index.d.ts';
  var customTypings = 'custom_typings/**/*.d.ts';
  var dest = 'lib';
  var destGlob = dest + '/**/*.*';
  var destGlobJs = dest + '/**/*.js';
  var coveredDest = 'lib_covered';
  var testEndpoint = dest + '/test/test.js';
  var coveredTestEndpoint = coveredDest + '/test/test.js';
  var startEndpoint = options.startEndpoint || dest + '/app.js';
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
    var tsProject = ts.createProject('tsconfig.json', { declaration: true });
    var tsResult = gulp.src(source)
      .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: swallowError })))
      .pipe(newer({ dest, ext: '.d.ts' }))
      .pipe(add.prepend(typings))
      .pipe(add.prepend(customTypings))
      .pipe(ts(tsProject));
    return tsResult.dts.pipe(gulp.dest(dest));
  });
  gulp.task('ts-compile', ['copy-files'], function () {
    compileErrors = 0;
    const noMap = filter('**/!(*.map)', { restore: false });
    const noTests = filter('**/(!test/**/*.*)', { restore: false });
    var tsProject = ts.createProject('tsconfig.json', { isolatedModules: true, declaration: false });
    var tsResult = gulp.src(source)
      .pipe(gulpIf(!stopOnErrors, plumber({ errorHandler: onError(() => {
        compileErrors++;
      }) })))
      .pipe(newer({ dest, ext: '.js' }))
      .pipe(sourcemaps.init())
      .pipe(add.prepend(typings))
      .pipe(add.prepend(customTypings))
      .pipe(ts(tsProject));
    var babelStream = tsResult.js.pipe(babel());
    return merge([
      tsResult.dts
        .pipe(gulp.dest(dest)),
      babelStream
        .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
        .pipe(gulp.dest(dest))
        .pipe(noMap)
        // .pipe(noTests)
        .pipe(istanbul())
        .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
        .pipe(gulp.dest('lib_covered')),
    ]);
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
  gulp.task('test', function (callback) {
    return sequence(
      // 'pre-test',
      'do-test-covered',
      'remap-istanbul'
      )(callback);
  });
  function doTest(endpoints) {
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
  gulp.task('start', function () {
    nodemon({
      script: startEndpoint,
      watch: [destGlob],
    });
  });
  gulp.task('ts-watch-compile', function () {
    gulp.watch(source, ['ts-compile']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-watch-test', function () {
    gulp.watch(source, ['ts-compile-and-test']);
    // gulp.watch(otherFiles, ['copy-files']);
  });
  gulp.task('ts-compile-and-test', function (callback) {
    sequence('ts-definitions', 'ts-compile', 'test')(callback);
  });
  gulp.task('ts-fresh-compile', function (callback) {
    sequence('cleanup', 'ts-definitions', 'ts-compile')(callback);
  });
  gulp.task('ts-run-build', function (callback) {
    sequence('ts-fresh-compile', 'ts-watch-compile')(callback);
  });
  gulp.task('ts-run-test', function (callback) {
    sequence('ts-run-build', 'ts-watch-test', 'test')(callback);
  });
  gulp.task('ts-run', function (callback) {
    sequence('ts-watch-compile', 'start')(callback);
  });
};
