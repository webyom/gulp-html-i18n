chai = require 'chai'
should = chai.should()
gutil = require 'gulp-util'
sinon = require 'sinon'
i18n  = require '../src/index'
fs = require 'fs-extra'

localesDir = './test/locales'

removeDir = ->
    fs.removeSync localesDir

createLocaleFiles = (files) ->
    for filename, fileData of files
        fs.outputFileSync localesDir + filename, fileData

testTranslation = (file, validator, cb, options) ->
    options = options || {}
    options.langDir = localesDir

    stream = i18n options
    .on 'end', cb
    .on 'data', validator
    stream.write file
    stream.end()

describe 'gulp-html-i18n', ->
    afterEach ->
        removeDir()

    describe 'basic', ->
        it 'replacement', (cb) ->
            createLocaleFiles
                '/en/new.json': '{ "hello" : "here" }'

            sourceFile = new gutil.File
                path: 'file.html',
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            validator = (file) ->
                file.path.should.equal 'file-en.html'
                file.contents.toString().should.equal 'Not there but here'

            testTranslation sourceFile, validator, cb

        it 'replacement to folders', (cb) ->
            createLocaleFiles
                '/en/new.json': '{ "hello" : "here" }'
                '/es/new.json': '{ "hello" : "here" }'

            sourceFile = new gutil.File
                base: '../'
                path: '../file.html'
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            i = 0
            paths = [
                '../en/file.html',
                '../es/file.html'
            ]

            validator = (file) =>
                file.path.should.equal paths[i]
                i++

            testTranslation sourceFile, validator, cb,
              createLangDirs : true

        it 'yaml', (cb) ->
            createLocaleFiles
                '/en/index.yaml': 'home: where the heart is'

            sourceFile = new gutil.File
                base: '../'
                path: '../file.html'
                contents: new Buffer 'Home is ${{ index.home }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Home is where the heart is'

            testTranslation sourceFile, validator, cb

    describe 'regex', ->
        it 'recursive replacement', (cb) ->
            createLocaleFiles
                '/en/mankind.json': '{ "is" : "${{ love.is }}$" }'
                '/en/love.json': '{ "is" : "one" }'

            sourceFile = new gutil.File
                base: '../'
                path: '../file.html'
                contents: new Buffer 'Mankind is ${{ mankind.is }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Mankind is one'

            testTranslation sourceFile, validator, cb

    describe 'mustache', ->
        it 'basic json', (cb) ->
            createLocaleFiles
                '/en/new.json': '{ "hello" : "here" }'

            sourceFile = new gutil.File
                path: 'file.html',
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            validator = (file) ->
                file.path.should.equal 'file-en.html'
                file.contents.toString().should.equal 'Not there but here'

            testTranslation sourceFile, validator, cb,
                renderEngine: 'mustache'

        it 'basic loops', (cb) ->
            createLocaleFiles
                '/en/contact.json': '{ "links" : ["google","facebook"] }'

            sourceFile = new gutil.File
                path: 'file.html',
                contents: new Buffer 'Contact us ${{# contact.links }}$<a>${{ . }}$</a>${{/ contact.links }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Contact us <a>google</a><a>facebook</a>'

            testTranslation sourceFile, validator, cb,
                renderEngine: 'mustache'