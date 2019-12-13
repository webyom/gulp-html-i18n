Q           = require 'q'
fs          = require 'fs'
path        = require 'path'
async       = require 'async'
log         = require 'fancy-log'
Vinyl       = require 'vinyl'
chalk       = require 'chalk'
replaceExt  = require 'replace-ext'
PluginError = require 'plugin-error'
through     = require 'through2'
extend      = require 'extend'
mustache    = require 'mustache'
YAML        = require 'yamljs'

CWD                 = process.cwd()
EOL                 = '\n'
defaultLangRegExp   = /\${{ ?([\w\-\.]+) ?}}\$/g
defaultDelimiters   = ['${{','}}$']
defaultRenderEngine = 'regex'
supportedType       = ['.js', '.json', '.yaml']

#
# Get full file base
#
resolveFileBase = (fileBase) ->
  if not path.isAbsolute fileBase
    fileBase = path.resolve CWD, fileBase
  if fileBase.slice(-1) isnt path.sep
    fileBase += path.sep
  fileBase

#
# Get file path relative to file base
#
getRelativeFilePath = (filePath, fileBase) ->
  fileBase = resolveFileBase fileBase
  filePath.slice fileBase.length

#
# Add error handling to mustache
#
mustache.Context.prototype._lookup = mustache.Context.prototype.lookup
wrapMustacheLookUp = ->
  mustache.Context.prototype.lookup = (name) ->
    value = this._lookup name
    type = typeof(value)

    if value is null or type is 'undefined' or type is 'number' and not isFinite(value)
      this.handleUndefined name, this.opt
    value

restoreMustacheLookup = ->
  mustache.Context.prototype.lookup = mustache.Context.prototype._lookup

#
# Convert a property name into a reference to the definition
#
getProperty = (propName, properties, opt) ->
  tmp = propName.split '.'
  res = properties
  while tmp.length and res
    key = tmp.shift()
    res = res[key]

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
    throw new Error "#{propName} not found in definition file!"
  else
    log chalk.red "#{propName} not found in definition file!"

#
# Renders using Regex
#
regexReplaceProperties = (langRegExp, delimiters, content, properties, opt, lv) ->
  objResArr = []
  content = content.replace langRegExp, (full, propName) ->
    res = getProperty propName, properties, opt
    if typeof res isnt 'string'
      if opt._resolveReference and res and typeof(res) is 'object'
        objResArr.push res
        res = '__GULP_HTML_I18N_OBJ_RES_' + (objResArr.length - 1)
      else
        res = '*' + propName + '*'
    else
      shouldBeProcessedAgain = langRegExp.test res
      if shouldBeProcessedAgain
        if lv > 3
          res = '**' + propName + '**'
        else
          res = regexReplaceProperties langRegExp, delimiters, res, properties, opt, lv + 1
    res
  if objResArr.length
    for i in [0...objResArr.length]
      res = JSON.stringify objResArr[i]
      content = content.replace '"__GULP_HTML_I18N_OBJ_RES_' + i + '"', res
  content

#
# Renders using Mustache
#
mustacheReplaceProperties = (langRegExp, delimiters, content, properties, opt, lv) ->
  mustache.Context.prototype.opt = opt
  mustache.Context.prototype.handleUndefined = handleUndefined
  mustache.tags = delimiters

  content = mustache.render content, properties

engines =
  regex : regexReplaceProperties
  mustache : mustacheReplaceProperties

#
# Does the actual work of substituting tags for definitions
#
replaceProperties = (content, properties, opt, lv) ->
  lv = lv || 1
  langRegExp = opt.langRegExp || defaultLangRegExp
  renderEngine = opt.renderEngine || defaultRenderEngine
  delimiters = opt.delimiters || defaultDelimiters
  if opt.fallback && opt._fallbackProperties
    properties = extend true, {}, opt._fallbackProperties, properties
  if not properties
    return content

  engines[renderEngine] langRegExp, delimiters, content, properties, opt, lv

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
      else if path.extname(filePath) is '.yaml'
        res = getYAMLResource(filePath)
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

  # Parse a YAML file into a resource object
  getYAMLResource = (filePath) ->
    define(YAML.parse(fs.readFileSync(filePath).toString()))

  #
  # Load a resource file into a dictionary named after the file
  #
  # e.g. foo.json will create a resource named foo
  #
  getResource = (langDir, res) ->
    Q.Promise (resolve, reject) ->
      if fs.statSync(langDir).isDirectory()
        res = res || {}
        fileList = fs.readdirSync langDir

        async.each(
          fileList
          (fileName, cb) ->
            filePath = path.resolve langDir, fileName
            if path.extname(filePath) in supportedType
              try
                fileStem = path.basename(filePath).replace(/\.(js|json|yaml)?$/, '')
                fileResource = getResourceFile filePath
                if res[fileStem]?
                  extend res[fileStem], fileResource
                else
                  res[fileStem] = fileResource
              catch e
                log chalk.red e.message

            else if fs.statSync(filePath).isDirectory()
              res[fileName] = res[fileName] || {}
              getResource(filePath, res[fileName])
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

createRegExpFromDelimiters = (delimiters) ->
  specialCharactersRegEx = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g
  leftDelimiter = delimiters[0].replace specialCharactersRegEx, "\\$&"
  rightDelimiter = delimiters[1].replace specialCharactersRegEx, "\\$&"

  new RegExp(leftDelimiter + ' ?([\\w\\-\\.]+) ?' + rightDelimiter, 'g')

module.exports = (opt = {}) ->
  if not opt.langDir
    throw new PluginError('gulp-html-i18n', 'Please specify langDir')

  if opt.delimiters and 'array' is typeof opt.delimiters
    throw new PluginError('gulp-html-i18n', 'Delimiters must be an array')

  if opt.renderEngine and !engines[opt.renderEngine]
    throw new PluginError('gulp-html-i18n', 'Render engine `'+ opt.renderEngine+'` is not supported. Please use `regex` or `mustache`')

  if opt.delimiters and not opt.langRegExp
    opt.langRegExp = createRegExpFromDelimiters opt.delimiters

  if opt.renderEngine is 'mustache'
    wrapMustacheLookUp()

  runId = opt.runId || Math.random()
  langDir = path.resolve CWD, opt.langDir
  seperator = opt.seperator || '-'
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new PluginError('gulp-html-i18n', 'File can\'t be null')

    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n', 'Streams not supported')

    getLangResource(langDir, opt).then(
      (langResource) =>
        if opt.fallback
          opt._fallbackProperties = langResource[opt.fallback]
        _langs_ = langResource.LANG_LIST
        if file._lang_ and file.runId is runId
          _filename_ = path.basename file.path
          _filepath_ = getRelativeFilePath file.path, file.base
          fileInfo = {_lang_: file._lang_, _langs_: _langs_, _default_lang_: opt.defaultLang || '', _filename_: _filename_, _filepath_: _filepath_}
          extDef = if opt.extendDefination then opt.extendDefination(fileInfo) else {}
          content = replaceProperties file.contents.toString(),
            extend(extDef, langResource[file._lang_], fileInfo), opt
          file.contents = new Buffer content
          @push file
        else
          file.runId = runId;
          _langs_.forEach (lang) =>
            originPath = file.path
            newFilePath = originPath.replace /\.src\.html$/, '\.html'

            fileInfo = {_lang_: lang, _langs_: _langs_, _default_lang_: opt.defaultLang || ''}
            extDef = if opt.extendDefination then opt.extendDefination(fileInfo) else {}

            #
            # If the option `createLangDirs` is set, save path/foo.html
            # to path/lang/foo.html. Otherwise, save to path/foo-lang.html
            #
            if opt.createLangDirs
              newFilePath = path.join resolveFileBase(file.base), lang, getRelativeFilePath(newFilePath, file.base)
              if opt.filenameI18n
                newFilePath = replaceProperties newFilePath,
                  extend(extDef, langResource[lang], fileInfo), opt
            #
            # If the option `inline` is set, replace the tags in the same source file,
            # rather than creating a new one
            #
            else if opt.inline
              newFilePath = originPath
            else
              if opt.filenameI18n
                newFilePath = replaceProperties newFilePath,
                  extend(extDef, langResource[lang], fileInfo), opt
              else
                newFilePath = replaceExt(
                  newFilePath,
                  seperator + lang + path.extname(originPath)
                )

            _filename_ = path.basename newFilePath
            _filepath_ = getRelativeFilePath newFilePath, file.base

            fileInfo = extend {_filename_: _filename_, _filepath_: _filepath_}, fileInfo
            extDef = if opt.extendDefination then opt.extendDefination(fileInfo) else {}

            content = replaceProperties file.contents.toString(),
              extend(extDef, langResource[lang], fileInfo), opt

            if opt.trace
              tracePath = path.relative(CWD, originPath)
              if path.extname(originPath).toLowerCase() in ['.html', '.htm', '.xml']
                trace = '<!-- trace:' + tracePath + ' -->'
                if (/(<body[^>]*>)/i).test content
                  content = content.replace /(<body[^>]*>)/i, '$1' + EOL + trace
                else
                  content = trace + EOL + content
              else
                trace = '/* trace:' + tracePath + ' */'
                content = trace + EOL + content
            newFile = new Vinyl
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
                newFile = new Vinyl
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
        @emit 'error', new PluginError('gulp-html-i18n', err)
    ).done( () ->
      if opt.renderEngine is 'mustache'
        restoreMustacheLookup()
    )

module.exports.resolveReference = (opt = {}) ->
  if not opt.langDir
    throw new PluginError('gulp-html-i18n:resolveReference', 'Please specify langDir')

  if opt.delimiters and 'array' is typeof opt.delimiters
    throw new PluginError('gulp-html-i18n:resolveReference', 'Delimiters must be an array')

  if opt.renderEngine and !engines[opt.renderEngine]
    throw new PluginError('gulp-html-i18n:resolveReference', 'Render engine `'+ opt.renderEngine+'` is not supported. Please use `regex` or `mustache`')

  if opt.delimiters and not opt.langRegExp
    opt.langRegExp = createRegExpFromDelimiters opt.delimiters

  if opt.renderEngine is 'mustache'
    wrapMustacheLookUp()

  langDir = path.resolve CWD, opt.langDir
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new PluginError('gulp-html-i18n:resolveReference', 'File can\'t be null')

    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n:resolveReference', 'Streams not supported')

    relPath = path.relative langDir, file.path

    if relPath.indexOf('.') is 0
      return @emit 'error',
        new PluginError('gulp-html-i18n:resolveReference', 'Not language resource file')

    lang = relPath.split('/')[0]

    getLangResource(langDir, opt).then(
      (langResource) =>
        _langs_ = langResource.LANG_LIST
        _filename_ = path.basename file.path
        _filepath_ = getRelativeFilePath file.path, file.base
        fileInfo = {_lang_: lang, _langs_: _langs_, _default_lang_: opt.defaultLang || '', _filename_: _filename_, _filepath_: _filepath_}
        extDef = if opt.extendDefination then opt.extendDefination(fileInfo) else {}
        content = replaceProperties file.contents.toString(),
          extend(extDef, langResource[lang], fileInfo), extend({_resolveReference: true}, opt)
        file.contents = new Buffer content
        @push file
        next()
      (err) =>
        @emit 'error', new PluginError('gulp-html-i18n', err)
    ).done( () ->
      if opt.renderEngine is 'mustache'
        restoreMustacheLookup()
    )

module.exports.restorePath = () ->
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new PluginError('gulp-html-i18n:restorePath', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n:restorePath', 'Streams not supported')
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
        new PluginError('gulp-html-i18n:i18nPath', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n:i18nPath', 'Streams not supported')
    if file._i18nPath_
      file.path = file._i18nPath_
    @push file
    next()

module.exports.jsonSortKey = (opt = {}) ->
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new PluginError('gulp-html-i18n:jsonSortKey', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n:jsonSortKey', 'Streams not supported')

    convert = (obj, objKey) ->
      keyStack.push objKey
      if not obj or typeof obj isnt 'object'
        res = obj
      else if Array.isArray obj
        res = obj.map (item, i) ->
          convert item, i
      else if opt.reserveOrder and opt.reserveOrder(keyStack) is true
        res = obj
      else
        res = {}
        keys = Object.keys(obj).sort()
        keys.forEach (key) ->
          res[key] = convert obj[key], key
      keyStack.pop()
      res

    keyStack = []
    contents = file.contents.toString()
    obj = JSON.parse contents
    obj = convert obj
    contents = JSON.stringify obj, null, 2
    if opt.endWithNewline
      contents = contents + EOL
    file.contents = new Buffer contents
    @push file
    next()

module.exports.validateJsonConsistence = (opt = {}) ->
  if not opt.langDir
    throw new PluginError('gulp-html-i18n:validateJsonConsistence', 'Please specify langDir')

  langDir = path.resolve CWD, opt.langDir
  langList = fs.readdirSync langDir
  langList = langList.filter (lang) ->
    dir = path.resolve langDir, lang
    fs.statSync(dir).isDirectory()
  through.obj (file, enc, next) ->
    if file.isNull()
      return @emit 'error',
        new PluginError('gulp-html-i18n:validateJsonConsistence', 'File can\'t be null')
    if file.isStream()
      return @emit 'error',
        new PluginError('gulp-html-i18n:validateJsonConsistence', 'Streams not supported')

    compare = (src, target, targetFilePath, compareKey) =>
      error = () =>
        log chalk.red '"' + keyStack.join('.') + '" not consistence in files:' + EOL + filePath + EOL + targetFilePath
        @emit 'error',
          new PluginError('gulp-html-i18n:validateJsonConsistence', 'validateJsonConsistence failed')

      keyStack.push compareKey
      srcType = typeof src
      targetType = typeof target
      if srcType isnt targetType or Array.isArray(src) and not Array.isArray(target)
        return error()
      if Array.isArray src
        src.forEach (item, i) ->
          compare src[i], target[i], targetFilePath, i
      else if src and srcType is 'object'
        Object.keys(src).forEach (key) ->
          compare src[key], target[key], targetFilePath, key
      keyStack.pop()

    filePath = file.path
    tmp = filePath.slice(langDir.length).replace(/^[\/\\]+/, '').split(path.sep)
    currentLang = tmp.shift()
    if currentLang in langList
      langFileName = tmp.join path.sep
      compareLangList = langList.filter (lang) ->
        lang isnt currentLang
      obj = require filePath
      keyStack = []
      compareLangList.forEach (lang) ->
        compareFilePath = [langDir, lang, langFileName].join path.sep
        compareObj = require compareFilePath
        compare obj, compareObj, compareFilePath, ''
    @push file
    next()

module.exports.engines = engines
module.exports.handleUndefined = handleUndefined
