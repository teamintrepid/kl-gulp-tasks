/* eslint-disable no-var, prefer-arrow-callback, prefer-template, func-names */
var env = process.env.NODE_ENV || 'development';
var stopOnErrors = ['production', 'build', 'prepublish'].indexOf(env) !== -1;
var debug = process.env.DEBUG === 1;

var fs = require('fs');

var gulp = require('gulp');
var babel = require('gulp-babel');
// var istanbul = require('gulp-istanbul');
var sequence = require('gulp-sequence');
var newer = require('gulp-newer');
var spawnMocha = require('gulp-spawn-mocha');
var inlineMocha = require('gulp-mocha');
var ts = require('gulp-typescript');
var clean = require('gulp-clean');
var sourcemaps = require('gulp-sourcemaps');
var _if = require('gulp-if');
var plumber = require('gulp-plumber');
var notify = require('gulp-notify');
// var tap = require('gulp-tap');
var add = require('gulp-add-src');
// var inspector = require('gulp-node-inspector');

var notifier = require('node-notifier');
var merge = require('merge2');

var otherFiles = 'src/**/!(*.js|*.map|*.src|*.ts|*.d.ts)';
var source = 'src/**/*.ts';
var typings = 'typings/index.d.ts';
var dest = 'lib';
var es6dest = 'lib_es6';
var testEndpoint = dest + '/test/test.js';
// var modulesGlob = 'node_modules/**/*.*';

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf8'));
var packageVersion = packageInfo.name + '@' + packageInfo.version;

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

gulp.task('cleanup', ['cleanup-dest', 'cleanup-es6dest']);
gulp.task('cleanup-dest', function () {
  return gulp.src(dest, { read: false }).pipe(clean());
});
gulp.task('cleanup-es6dest', function () {
  return gulp.src(es6dest, { read: false }).pipe(clean());
});
gulp.task('copy-files', function () {
  return gulp.src(otherFiles)
    .pipe(newer(dest))
    // .pipe(tap(function(file) {
    //     console.log('copy', file.path);
    //  }))
    .pipe(gulp.dest(dest));
});
gulp.task('ts-definitions', function () {
  var tsProject = ts.createProject('tsconfig.json');
  var tsResult = gulp.src(source)
    .pipe(_if(!stopOnErrors, plumber({ errorHandler: swallowError })))
    .pipe(newer({ dest, ext: '.d.ts' }))
    .pipe(add.prepend(typings))
    .pipe(ts(tsProject));
  return tsResult.dts.pipe(gulp.dest(dest));
});
gulp.task('ts-compile', ['copy-files', 'ts-definitions'], function () {
  var tsProject = ts.createProject('tsconfig.json', { isolatedModules: true });
  var tsResult = gulp.src(source)
    .pipe(_if(!stopOnErrors, plumber({ errorHandler: onError() })))
    .pipe(newer({ dest, ext: '.js' }))
    .pipe(sourcemaps.init())
    .pipe(add.prepend(typings))
    .pipe(ts(tsProject));
  return merge([
    tsResult.dts
      // .pipe(tap(function (file) {
      //   console.log('DTS   ---', file.path);
      // }))
      .pipe(gulp.dest(dest)),
    tsResult.js
      .pipe(babel())
      .pipe(sourcemaps.write('.', { sourceRoot: '/' + packageVersion + '/src' }))
      .pipe(gulp.dest(dest)),
  ]);
});

gulp.task('test', function () {
  var errorHappened = false;
  var mocha;
  if (debug) {
    mocha = spawnMocha({
      debugBrk: true,
      env: { NODE_ENV: 'test' },
    });
  } else {
    mocha = inlineMocha();
  }
  gulp.src([testEndpoint], { read: false })
  .pipe(_if(!stopOnErrors, plumber({ errorHandler: onError(function () {
    errorHappened = true;
  }) })))
  .pipe(mocha)
  .on('end', function () {
    if (!errorHappened) {
      notifier.notify(
        { title: 'All tests passed in ' + packageInfo.name, message: 'Write some more' }
      );
    }
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
  sequence('cleanup', 'ts-compile')(callback);
});
gulp.task('ts-run-build', function (callback) {
  sequence('ts-fresh-compile', 'ts-watch-compile')(callback);
});
gulp.task('ts-run-test', function (callback) {
  sequence('ts-run-build', 'ts-watch-test', 'test')(callback);
});
