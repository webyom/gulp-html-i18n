chai = require 'chai';
should = chai.should();
gutil = require 'gulp-util';
sinon = require 'sinon';
i18n  = require '../src/index'

describe 'gulp-html-i18n', ->
    it 'hello should equal hello', ->
        "hello".should.equal "hello"