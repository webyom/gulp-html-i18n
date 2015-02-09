Q       = require 'q'
fs      = require 'fs'
path    = require 'path'
async   = require 'async'
gutil   = require 'gulp-util'
through = require 'through2'

EOL           = '\n'
langRegExp    = /\${{([\w\-\.]+)}}\$/g
supportedType = ['.js', '.json']

#
# Convert a property name into a reference to the definition
#
getProperty = (propName, properties) ->
  tmp = propName.split '.'
  res = properties
  while tmp.length and res
    res = res[tmp.shift()]

    console.log propName, 'not found in definition file!' if res == undefined
  res

#
# Does the actual work of substituting tags for definitions
#
replaceProperties = (content, properties, lv) ->
  lv = lv || 1
  if not properties
    return content
  content.replace langRegExp, (full, propName) ->
    res = getProperty propName, properties
    if typeof res isnt 'string'
      res = '*' + propName + '*'
    else if langRegExp.test res
      if lv > 3
        res = '**' + propName + '**'
      else
        res = replaceProperties res, properties, lv + 1
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
        res = eval fs.readFileSync(filePath).toString()
      else if path.extname(filePath) is '.json'
        res = getJSONResource(filePath)
    catch e
        throw new Error 'Language file "' + filePath + '" syntax error! - ' + e.toString()
      if typeof res is 'function'
        res = res()
    res

  getJsResource = (filePath) ->
    res = eval(fs.readFileSync(filePath).toString())
    res = res() if (typeof res === 'function')
    res

  getJSONResource = (filePath) ->
    define(JSON.parse(fs.readFileSync(filePath).toString()))

  getResource = (langDir) ->
    Q.Promise (resolve, reject) ->
      if fs.statSync(langDir).isDirectory()
        res = {}
        fileList = fs.readdirSync langDir
        async.each(
          fileList
          (filePath, cb) ->
            if path.extname(filePath) is '.js'
              filePath = path.resolve langDir, filePath
              res[path.basename(filePath).replace(/\.js$/, '')] = getResourceFile filePath
            cb()
          (err) ->
            return reject err if err
            resolve res
        )
      else
        resolve()

  getLangResource = (dir) ->
    Q.Promise (resolve, reject) ->
      if langResource
        return resolve langResource
      res = LANG_LIST: []
      langList = fs.readdirSync dir
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
  throw new gutil.PluginError('gulp-html-i18n', 'Please spicity langDir') if not opt.langDir
  langDir = path.resolve process.cwd(), opt.langDir
  seperator = opt.seperator || '-'
  through.obj (file, enc, next) ->
    return @emit 'error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null') if file.isNull()
    return @emit 'error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported') if file.isStream()
    getLangResource(langDir).then(
      (langResource) =>
        if file._lang_
          content = replaceProperties file.contents.toString(), langResource[file._lang_]
          file.contents = new Buffer content
          @push file
        else
          langResource.LANG_LIST.forEach (lang) =>
            originPath = file.path
            newFilePath = originPath.replace /\.src\.html$/, '\.html'
            newFilePath = gutil.replaceExtension newFilePath, seperator + lang + '.html'
            content = replaceProperties file.contents.toString(), langResource[lang]
            if opt.trace
              trace = '<!-- trace:' + path.relative(process.cwd(), originPath) + ' -->'
              if (/(<body[^>]*>)/i).test content
                content = content.replace /(<body[^>]*>)/i, '$1' + EOL + trace
              else
                content = trace + EOL + content
            newFile = new gutil.File
              base: file.base
              cwd: file.cwd
              path: newFilePath
              contents: new Buffer content
            newFile._lang_ = lang
            newFile._originPath_ = originPath
            @push newFile
        next()
      (err) =>
        @emit 'error', new gutil.PluginError('gulp-html-i18n', err)
    ).done()
