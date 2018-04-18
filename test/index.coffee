path = require 'path'
chai = require 'chai'
should = chai.should()
Vinyl = require 'vinyl'
sinon = require 'sinon'
i18n  = require '../lib/index'
fs = require 'fs-extra'

CWD = process.cwd()
BASE_DIR = path.join CWD, 'test'
LOCALES_DIR = path.join BASE_DIR, 'locales'

removeDir = ->
    fs.removeSync LOCALES_DIR

createLocaleFiles = (files) ->
    for filename, fileData of files
        fs.outputFileSync path.join(LOCALES_DIR, filename), fileData

testTranslation = (file, validator, cb, options) ->
    options = options || {}
    options.langDir = LOCALES_DIR

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
                'en/new.json': '{ "hello" : "here" }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            validator = (file) ->
                file.path.should.equal path.join(BASE_DIR, 'file-en.html')
                file.contents.toString().should.equal 'Not there but here'

            testTranslation sourceFile, validator, cb

        it 'replacement to folders', (cb) ->
            createLocaleFiles
                'en/new.json': '{ "hello" : "here" }'
                'es/new.json': '{ "hello" : "here" }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            i = 0
            paths = [
                path.join BASE_DIR, 'en/file.html'
                path.join BASE_DIR, 'es/file.html'
            ]

            validator = (file) =>
                file.path.should.equal paths[i]
                i++

            testTranslation sourceFile, validator, cb,
              createLangDirs : true

        it 'relative base', (cb) ->
            createLocaleFiles
                'en/new.json': '{ "hello" : "here" }'
                'es/new.json': '{ "hello" : "here" }'

            sourceFile = new Vinyl
                base: './test'
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            i = 0
            paths = [
                path.join BASE_DIR, 'en/file.html'
                path.join BASE_DIR, 'es/file.html'
            ]

            validator = (file) =>
                file.path.should.equal paths[i]
                i++

            testTranslation sourceFile, validator, cb,
              createLangDirs : true

        it 'yaml', (cb) ->
            createLocaleFiles
                'en/index.yaml': 'home: where the heart is'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Home is ${{ index.home }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Home is where the heart is'

            testTranslation sourceFile, validator, cb

    describe 'regex', ->
        it 'recursive replacement', (cb) ->
            createLocaleFiles
                'en/mankind.json': '{ "is" : "${{ love.is }}$" }'
                'en/love.json': '{ "is" : "one" }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Mankind is ${{ mankind.is }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Mankind is one'

            testTranslation sourceFile, validator, cb

    describe 'mustache', ->
        it 'basic json', (cb) ->
            createLocaleFiles
                'en/new.json': '{ "hello" : "here" }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Not there but ${{ new.hello }}$'

            validator = (file) ->
                file.path.should.equal path.join(BASE_DIR, 'file-en.html')
                file.contents.toString().should.equal 'Not there but here'

            testTranslation sourceFile, validator, cb,
                renderEngine: 'mustache'

        it 'basic loops', (cb) ->
            createLocaleFiles
                'en/contact.json': '{ "links" : ["google","facebook"] }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer 'Contact us ${{# contact.links }}$<a>${{ . }}$</a>${{/ contact.links }}$'

            validator = (file) ->
                file.contents.toString().should.equal 'Contact us <a>google</a><a>facebook</a>'

            testTranslation sourceFile, validator, cb,
                renderEngine: 'mustache'

        it '_langs_', (cb) ->
            createLocaleFiles
                'en/new.json': '{ "hello" : "here" }'
                'es/new.json': '{ "hello" : "here" }'
                'fr/new.json': '{ "hello" : "here" }'

            sourceFile = new Vinyl
                base: BASE_DIR
                path: path.join BASE_DIR, 'file.html'
                contents: new Buffer '${{#_langs_}}$${{.}}$${{/_langs_}}$'

            validator = (file) =>
                file.contents.toString().should.equal 'enesfr'

            testTranslation sourceFile, validator, cb,
                renderEngine: 'mustache'

        it 'throws error if not defined and fail on missing'
