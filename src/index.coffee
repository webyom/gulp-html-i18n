Q = require 'q'
fs = require 'fs'
path = require 'path'
async = require 'async'
gutil = require 'gulp-util'
through = require 'through2'

langRegExp = /\${{([\w\-\.]+)}}\$/g

getProperty = (propName, properties) ->
	tmp = propName.split '.'
	res = properties
	while tmp.length and res
		res = res[tmp.shift()]
	res

replaceProperties = (content, lang, properties, lv) ->
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
				res = replaceProperties res, lang, properties, lv + 1
		res
	content.replace /\%{{_lang_}}\%/g, lang

getLangResource = (->
	define = ->
		al = arguments.length
		if al >= 3
			arguments[2]
		else
			arguments[al - 1]
	
	require = ->

	langResource = null

	getResourceFile = (filePath) ->
		if path.extname(filePath) is '.js'
			try
				res = eval fs.readFileSync(filePath).toString 'utf8'
			catch
				throw new Error 'Language file "' + filePath + '" syntax error! - ' + e.toString()
			if typeof res is 'function'
				res = res()
		res
	
	getResource = (langDir) ->
		Q.Promise (resolve, reject) ->
			if fs.statSync(langDir).isDirectory()
				res = {}
				fileList = fs.readdirSync langDir
				async.each(
					fileList
					(filePath, cb) ->
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
				langResource.LANG_LIST.forEach (lang) =>
					newFilePath = file.path.replace /\.src\.html$/, '\.html'
					newFilePath = gutil.replaceExtension newFilePath, seperator + lang + '.html'
					content = replaceProperties file.contents.toString('utf8'), lang, langResource[lang]
					newFile = new gutil.File
						base: file.base
						cwd: file.cwd
						path: newFilePath
						contents: new Buffer content
					@push newFile
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-html-i18n', err)
		).done()
