gulp = require 'gulp'
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
gulp.task 'example', ->
  i18n = require './lib/index'
  gulp.src('example/src/**/*.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      trace: true
    .pipe gulp.dest('example/dest')

#
# Demonstrates writing the translation of a single language iniline,
# rather than creating language-specific files
#
gulp.task 'inline', ->
  i18n = require './lib/index'
  gulp.src('example/src/**/*.src.html')
    .pipe i18n
      langDir: 'example/src/lang'
      inline: 'en'
    .pipe gulp.dest('example/inline')

#
# Demonstrates creating language specific subdirectories, rather than
# creating suffixed files
#
gulp.task 'dirs', ->
  i18n = require './lib/index'
  gulp.src('example/src/**/*.src.html')
    .pipe i18n
      createLangDirs: true
      langDir: 'example/src/lang'
      trace: true
    .pipe gulp.dest('example/dirs')


#
# Calling `gulp` will compile
#
gulp.task 'default', ['compile']
