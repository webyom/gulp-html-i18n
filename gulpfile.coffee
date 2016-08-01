gulp = require 'gulp'
i18n = require './lib/index'
coffee = require 'gulp-coffee'

#
# Writes the coffeescript to javascript
#
gulp.task 'compile', ->
  gulp.src('src/**/*.coffee')
    .pipe coffee()
    .pipe gulp.dest('lib')

#
# Demonstrates a basic execution
#
gulp.task 'normal', ->
  gulp.src('example/src/**/index.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      trace: true
    .pipe gulp.dest('example/dest')

#
# Demonstrates writing the translation of a single language iniline,
# rather than creating language-specific files
#
gulp.task 'inline', ->
  gulp.src('example/src/**/index.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      inline: 'en'
    .pipe gulp.dest('example/dest/inline')

#
# Demonstrates creating language specific subdirectories, rather than
# creating suffixed files
#
gulp.task 'dirs', ->
  gulp.src('example/src/**/index.src.html')
    .pipe i18n
      createLangDirs: true
      langDir: 'example/src/lang'
      defaultLang: 'zh-cn'
      trace: true
    .pipe gulp.dest('example/dest/dirs')

#
# Demonstrates what happens when a key is missing
#
gulp.task 'failure', ->
  gulp.src('example/src/**/failure.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      trace: true
      failOnMissing: false
    .pipe gulp.dest('example/dest/failure')

#
# Demonstrates what happens when a key is missing
#
gulp.task 'fallback', ->
  gulp.src('example/src/**/index.src.html')
    .pipe i18n
      langDir: 'example/src/fallback'
      trace: true
      fallback: 'en'
    .pipe gulp.dest('example/dest/fallback')

#
# Demonstrates escape
#
gulp.task 'escape', ->
  gulp.src('example/src/**/escape.src.html')
    .pipe i18n
      escapeQuotes: true
      langDir: 'example/src/escape'
      trace: true
    .pipe gulp.dest('example/dest/escape')

#
# Demonstrates commonjs
#
gulp.task 'commonjs', ->
  gulp.src('example/src/**/index.src.html')
    .pipe i18n
      langDir: 'example/src/commonjs'
      trace: true
    .pipe gulp.dest('example/dest/commonjs')

#
# Demonstrates filename-i18n
#
gulp.task 'filename-i18n', ->
  gulp.src('example/src/**/${{common.title}}$.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      filenameI18n: true
      trace: true
    .pipe gulp.dest('example/dest/filename-i18n')

#
# Demonstrates filename-i18n
#
gulp.task 'jsfile', ->
  gulp.src('example/src/index.js')
    .pipe i18n
      langDir: 'example/src/lang'
      trace: true
    .pipe gulp.dest('example/dest')

#
# Calling `gulp` will compile
#
gulp.task 'default', ['compile']
gulp.task 'example', ['normal', 'inline', 'dirs', 'failure', 'fallback', 'escape', 'commonjs', 'filename-i18n', 'jsfile']
