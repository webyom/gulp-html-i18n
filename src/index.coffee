Q       = require 'q'
fs      = require 'fs'
path    = require 'path'
async   = require 'async'
gutil   = require 'gulp-util'
through = require 'through2'
extend  = require 'extend'

EOL               = '\n'
defaultLangRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g
supportedType     = ['.js', '.json']

#
# Convert a property name into a reference to the definition
#
getProperty = (propName, properties, opt) ->
  tmp = propName.split '.'
  res = properties
  while tmp.length and res
    res = res[tmp.shift()]

    handleUndefined(propName, opt) if res is undefined

  if res and opt.escapeQuotes is true
    res = res.replace(/"/g, '\\"')
    res = res.replace(/'/g, "\\'")

  res

#
# Handler for undefined props
#
handleUndefined = (propName, opt) ->
  if opt.failOnMissing
    throw "#{propName} not found in definition file!"
  else
    console.warn "#{propName} not found in definition file!"

#
# Does the actual work of substituting tags for definitions
#
replaceProperties = (content, properties, opt, lv) ->
  lv = lv || 1
  langRegExp = opt.langRegExp || defaultLangRegExp
  if not properties
    return content
  content.replace langRegExp, (full, propName) ->
    res = getProperty propName, properties, opt
    if typeof res isnt 'string'
      if !opt.fallback
        res = '*' + propName + '*'
      else
        res = '${{ ' + propName + ' }}$'
    else if langRegExp.test res
      if lv > 3
        res = '**' + propName + '**'
      else
        res = replaceProperties res, properties, opt, lv + 1
    res

#
# Load the definitions for all languages
#
getLangResource = (->
  define = ->
    al = arguments.length
    if al >= 3
      arguments[2]
    else
      arguments[al - 1]

  require = ->

  langResource = null

  #
  # Open a file from the language dir and set up definitions from that file
  #
  getResourceFile = (filePath) ->
    try
      if path.extname(filePath) is '.js'
        res = getJsResource(filePath)
      else if path.extname(filePath) is '.json'
        res = getJSONResource(filePath)
    catch e
      throw new Error 'Language file "' + filePath + '" syntax error! - ' +
        e.toString()
    if typeof res is 'function'
      res = res()
    res

  # Interpret the string contents of a JS file as a resource object
  getJsResource = (filePath) ->
    res = eval(fs.readFileSync(filePath).toString())
    res = res() if (typeof res is 'function')
    res

  # Parse a JSON file into a resource object
  getJSONResource = (filePath) ->
    define(JSON.parse(fs.readFileSync(filePath).toString()))

  #
  # Load a resource file into a dictionary named after the file
  #
  # e.g. foo.json will create a resource named foo
  #
  getResource = (langDir) ->
    Q.Promise (resolve, reject) ->
      if fs.statSync(langDir).isDirectory()
        res = {}
        fileList = fs.readdirSync langDir

        async.each(
          fileList
          (filePath, cb) ->
            if path.extname(filePath) in supportedType
              filePath = path.resolve langDir, filePath
              res[path.basename(filePath).replace(/\.js(on)?$/, '')] =
                getResourceFile filePath
            cb()
          (err) ->
            return reject err if err
            resolve res
        )
      else
        resolve()

  getLangResource = (dir, opt) ->
    Q.Promise (resolve, reject) ->
      if langResource
        return resolve langResource
      res = LANG_LIST: []
      langList = fs.readdirSync dir

      # Only load the provided language if inline is defined
      if opt.inline
        if fs.statSync(path.resolve dir, opt.inline).isDirectory()
          langList = [opt.inline]
        else
          throw new Error 'Language ' + opt.inline + ' has no definitions!'

      async.each(
        langList
        (langDir, cb) ->
          return cb() if langDir.indexOf('.') is 0
          langDir = path.resolve dir, langDir
          langCode = path.basename langDir

          if fs.statSync(langDir).isDirectory()
            res.LANG_LIST.push langCode
            getResource(langDir).then(
              (resource) ->
                res[langCode] = resource
                cb()
              (err) ->
                reject err
            ).done()
          else
            cb()
        (err) ->
          return reject err if err
          resolve res
      )
)()

module.exports = (opt = {}) ->
  if not opt.langDir
    throw new gutil.PluginError('gulp-html-i18n', 'Please specify langDir')

  langDir = path.resolve process.cwd(), opt.langDir
  seperator = opt.seperator || '-'
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'File can\'t be null')

    if file.isStream()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'Streams not supported')

    getLangResource(langDir, opt).then(
      (langResource) =>
        if file._lang_
          content = replaceProperties file.contents.toString(),
            extend({}, langResource[file._lang_], {_lang_: file._lang_, _default_lang_: opt.defaultLang || ''}), opt
          file.contents = new Buffer content
          @push file
        else
          langResource.LANG_LIST.forEach (lang) =>
            originPath = file.path
            newFilePath = originPath.replace /\.src\.html$/, '\.html'

            #
            # If the option `createLangDirs` is set, save path/foo.html
            # to path/lang/foo.html. Otherwise, save to path/foo-lang.html
            #
            if opt.createLangDirs
              newFilePath = file.base + lang + '/' + newFilePath.slice(file.base.length)
              if opt.filenameI18n
                newFilePath = replaceProperties newFilePath,
                  extend({}, langResource[lang], {_lang_: lang, _default_lang_: opt.defaultLang || ''}), opt
            #
            # If the option `inline` is set, replace the tags in the same source file,
            # rather than creating a new one
            #
            else if opt.inline
              newFilePath = originPath
            else
              if opt.filenameI18n
                newFilePath = replaceProperties newFilePath,
                  extend({}, langResource[lang], {_lang_: lang, _default_lang_: opt.defaultLang || ''}), opt
              else
                newFilePath = gutil.replaceExtension(
                  newFilePath,
                  seperator + lang + path.extname(originPath)
                )

            content = replaceProperties file.contents.toString(),
              extend({}, langResource[lang], {_lang_: lang, _default_lang_: opt.defaultLang || ''}), opt

            if opt.fallback
              content = replaceProperties content,
                extend({}, langResource[opt.fallback], {_lang_: lang, _default_lang_: opt.defaultLang || ''}), opt

            if opt.trace
              tracePath = path.relative(process.cwd(), originPath)
              if path.extname(originPath).toLowerCase() in ['.html', '.htm', '.xml']
                trace = '<!-- trace:' + tracePath + ' -->'
                if (/(<body[^>]*>)/i).test content
                  content = content.replace /(<body[^>]*>)/i, '$1' + EOL + trace
                else
                  content = trace + EOL + content
              else
                trace = '/* trace:' + tracePath + ' */'
                content = trace + EOL + content
            newFile = new gutil.File
              base: file.base
              cwd: file.cwd
              path: newFilePath
              contents: new Buffer content
            newFile._lang_ = lang
            newFile._originPath_ = originPath
            newFile._i18nPath_ = newFilePath
            if file.sourceMap
                newFile.sourceMap = file.sourceMap
            @push newFile
            if opt.createLangDirs and lang is opt.defaultLang
                newFilePath = originPath.replace /\.src\.html$/, '\.html'
                newFile = new gutil.File
                    base: file.base
                    cwd: file.cwd
                    path: newFilePath
                    contents: new Buffer content
                newFile._lang_ = lang
                newFile._originPath_ = originPath
                newFile._i18nPath_ = newFilePath
                if file.sourceMap
                    newFile.sourceMap = file.sourceMap
                @push newFile
        next()
      (err) =>
        @emit 'error', new gutil.PluginError('gulp-html-i18n', err)
    ).done()

module.exports.restorePath = () ->
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'Streams not supported')
    if file._originPath_
      file.path = file._originPath_
    if file.sourceMap
      newFile.sourceMap = file.sourceMap
    @push file
    next()

module.exports.i18nPath = () ->
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new gutil.PluginError('gulp-html-i18n', 'Streams not supported')
    if file._i18nPath_
      file.path = file._i18nPath_
    @push file
    next()
