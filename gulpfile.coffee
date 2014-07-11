gulp = require 'gulp'
coffee = require 'gulp-coffee'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'example', ->
	i18n = require './lib/index'
	through = require 'through2'
	gulp.src('example/src/**/*.src.html')
		.pipe i18n langDir: 'example/src/lang'
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']