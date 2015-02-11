gulp = require 'gulp'
coffee = require 'gulp-coffee'

gulp.task 'compile', ->
  gulp.src('src/**/*.coffee')
    .pipe coffee()
    .pipe gulp.dest('lib')

gulp.task 'example', ->
  i18n = require './lib/index'
  gulp.src('example/src/**/*.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      trace: true
    .pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']
