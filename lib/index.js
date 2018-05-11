(function() {
  var CWD, EOL, PluginError, Q, Vinyl, YAML, async, chalk, createRegExpFromDelimiters, defaultDelimiters, defaultLangRegExp, defaultRenderEngine, engines, extend, fs, getLangResource, getProperty, getRelativeFilePath, handleUndefined, log, mustache, mustacheReplaceProperties, path, regexReplaceProperties, replaceExt, replaceProperties, resolveFileBase, restoreMustacheLookup, supportedType, through, wrapMustacheLookUp,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  log = require('fancy-log');

  Vinyl = require('vinyl');

  chalk = require('chalk');

  replaceExt = require('replace-ext');

  PluginError = require('plugin-error');

  through = require('through2');

  extend = require('extend');

  mustache = require('mustache');

  YAML = require('yamljs');

  CWD = process.cwd();

  EOL = '\n';

  defaultLangRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g;

  defaultDelimiters = ['${{', '}}$'];

  defaultRenderEngine = 'regex';

  supportedType = ['.js', '.json', '.yaml'];

  resolveFileBase = function(fileBase) {
    if (!path.isAbsolute(fileBase)) {
      fileBase = path.resolve(CWD, fileBase);
    }
    if (fileBase.slice(-1) !== path.sep) {
      fileBase += path.sep;
    }
    return fileBase;
  };

  getRelativeFilePath = function(filePath, fileBase) {
    fileBase = resolveFileBase(fileBase);
    return filePath.slice(fileBase.length);
  };

  mustache.Context.prototype._lookup = mustache.Context.prototype.lookup;

  wrapMustacheLookUp = function() {
    return mustache.Context.prototype.lookup = function(name) {
      var type, value;
      value = this._lookup(name);
      type = typeof value;
      if (value === null || type === 'undefined' || type === 'number' && !isFinite(value)) {
        this.handleUndefined(name, this.opt);
      }
      return value;
    };
  };

  restoreMustacheLookup = function() {
    return mustache.Context.prototype.lookup = mustache.Context.prototype._lookup;
  };

  getProperty = function(propName, properties, opt) {
    var key, res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      key = tmp.shift();
      res = res[key];
      if (res === void 0) {
        handleUndefined(propName, opt);
      }
    }
    if (res && opt.escapeQuotes === true) {
      res = res.replace(/"/g, '\\"');
      res = res.replace(/'/g, "\\'");
    }
    return res;
  };

  handleUndefined = function(propName, opt) {
    if (opt.failOnMissing) {
      throw new Error(propName + " not found in definition file!");
    } else {
      return log(chalk.red(propName + " not found in definition file!"));
    }
  };

  regexReplaceProperties = function(langRegExp, delimiters, content, properties, opt, lv) {
    var i, j, objResArr, ref, res;
    objResArr = [];
    content = content.replace(langRegExp, function(full, propName) {
      var res, shouldBeProcessedAgain;
      res = getProperty(propName, properties, opt);
      if (typeof res !== 'string') {
        if (opt._resolveReference && res && typeof res === 'object') {
          objResArr.push(res);
          res = '__GULP_HTML_I18N_OBJ_RES_' + (objResArr.length - 1);
        } else {
          res = '*' + propName + '*';
        }
      } else {
        shouldBeProcessedAgain = langRegExp.test(res);
        if (shouldBeProcessedAgain) {
          if (lv > 3) {
            res = '**' + propName + '**';
          } else {
            res = regexReplaceProperties(langRegExp, delimiters, res, properties, opt, lv + 1);
          }
        }
      }
      return res;
    });
    if (objResArr.length) {
      for (i = j = 0, ref = objResArr.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        res = JSON.stringify(objResArr[i]);
        content = content.replace('"__GULP_HTML_I18N_OBJ_RES_' + i + '"', res);
      }
    }
    return content;
  };

  mustacheReplaceProperties = function(langRegExp, delimiters, content, properties, opt, lv) {
    mustache.Context.prototype.opt = opt;
    mustache.Context.prototype.handleUndefined = handleUndefined;
    mustache.tags = delimiters;
    return content = mustache.render(content, properties);
  };

  engines = {
    regex: regexReplaceProperties,
    mustache: mustacheReplaceProperties
  };

  replaceProperties = function(content, properties, opt, lv) {
    var delimiters, langRegExp, renderEngine;
    lv = lv || 1;
    langRegExp = opt.langRegExp || defaultLangRegExp;
    renderEngine = opt.renderEngine || defaultRenderEngine;
    delimiters = opt.delimiters || defaultDelimiters;
    if (opt.fallback && opt._fallbackProperties) {
      properties = extend(true, {}, opt._fallbackProperties, properties);
    }
    if (!properties) {
      return content;
    }
    return engines[renderEngine](langRegExp, delimiters, content, properties, opt, lv);
  };

  getLangResource = (function() {
    var define, getJSONResource, getJsResource, getResource, getResourceFile, getYAMLResource, langResource, require;
    define = function() {
      var al;
      al = arguments.length;
      if (al >= 3) {
        return arguments[2];
      } else {
        return arguments[al - 1];
      }
    };
    require = function() {};
    langResource = null;
    getResourceFile = function(filePath) {
      var e, res;
      try {
        if (path.extname(filePath) === '.js') {
          res = getJsResource(filePath);
        } else if (path.extname(filePath) === '.json') {
          res = getJSONResource(filePath);
        } else if (path.extname(filePath) === '.yaml') {
          res = getYAMLResource(filePath);
        }
      } catch (error1) {
        e = error1;
        throw new Error('Language file "' + filePath + '" syntax error! - ' + e.toString());
      }
      if (typeof res === 'function') {
        res = res();
      }
      return res;
    };
    getJsResource = function(filePath) {
      var res;
      res = eval(fs.readFileSync(filePath).toString());
      if (typeof res === 'function') {
        res = res();
      }
      return res;
    };
    getJSONResource = function(filePath) {
      return define(JSON.parse(fs.readFileSync(filePath).toString()));
    };
    getYAMLResource = function(filePath) {
      return define(YAML.parse(fs.readFileSync(filePath).toString()));
    };
    getResource = function(langDir, res) {
      return Q.Promise(function(resolve, reject) {
        var fileList;
        if (fs.statSync(langDir).isDirectory()) {
          res = res || {};
          fileList = fs.readdirSync(langDir);
          return async.each(fileList, function(fileName, cb) {
            var e, filePath, fileResource, fileStem, ref;
            filePath = path.resolve(langDir, fileName);
            if (ref = path.extname(filePath), indexOf.call(supportedType, ref) >= 0) {
              try {
                fileStem = path.basename(filePath).replace(/\.(js|json|yaml)?$/, '');
                fileResource = getResourceFile(filePath);
                if (res[fileStem] != null) {
                  extend(res[fileStem], fileResource);
                } else {
                  res[fileStem] = fileResource;
                }
              } catch (error1) {
                e = error1;
                log(chalk.red(e.message));
              }
            } else if (fs.statSync(filePath).isDirectory()) {
              res[fileName] = res[fileName] || {};
              getResource(filePath, res[fileName]);
            }
            return cb();
          }, function(err) {
            if (err) {
              return reject(err);
            }
            return resolve(res);
          });
        } else {
          return resolve();
        }
      });
    };
    return getLangResource = function(dir, opt) {
      return Q.Promise(function(resolve, reject) {
        var langList, res;
        if (langResource) {
          return resolve(langResource);
        }
        res = {
          LANG_LIST: []
        };
        langList = fs.readdirSync(dir);
        if (opt.inline) {
          if (fs.statSync(path.resolve(dir, opt.inline)).isDirectory()) {
            langList = [opt.inline];
          } else {
            throw new Error('Language ' + opt.inline + ' has no definitions!');
          }
        }
        return async.each(langList, function(langDir, cb) {
          var langCode;
          if (langDir.indexOf('.') === 0) {
            return cb();
          }
          langDir = path.resolve(dir, langDir);
          langCode = path.basename(langDir);
          if (fs.statSync(langDir).isDirectory()) {
            res.LANG_LIST.push(langCode);
            return getResource(langDir).then(function(resource) {
              res[langCode] = resource;
              return cb();
            }, function(err) {
              return reject(err);
            }).done();
          } else {
            return cb();
          }
        }, function(err) {
          if (err) {
            return reject(err);
          }
          return resolve(res);
        });
      });
    };
  })();

  createRegExpFromDelimiters = function(delimiters) {
    var leftDelimiter, rightDelimiter, specialCharactersRegEx;
    specialCharactersRegEx = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;
    leftDelimiter = delimiters[0].replace(specialCharactersRegEx, "\\$&");
    rightDelimiter = delimiters[1].replace(specialCharactersRegEx, "\\$&");
    return new RegExp(leftDelimiter + ' ?([\\w\\-\\.]+) ?' + rightDelimiter, 'g');
  };

  module.exports = function(opt) {
    var langDir, runId, seperator;
    if (opt == null) {
      opt = {};
    }
    if (!opt.langDir) {
      throw new PluginError('gulp-html-i18n', 'Please specify langDir');
    }
    if (opt.delimiters && 'array' === typeof opt.delimiters) {
      throw new PluginError('gulp-html-i18n', 'Delimiters must be an array');
    }
    if (opt.renderEngine && !engines[opt.renderEngine]) {
      throw new PluginError('gulp-html-i18n', 'Render engine `' + opt.renderEngine + '` is not supported. Please use `regex` or `mustache`');
    }
    if (opt.delimiters && !opt.langRegExp) {
      opt.langRegExp = createRegExpFromDelimiters(opt.delimiters);
    }
    if (opt.renderEngine === 'mustache') {
      wrapMustacheLookUp();
    }
    runId = Math.random();
    langDir = path.resolve(CWD, opt.langDir);
    seperator = opt.seperator || '-';
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n', 'Streams not supported'));
      }
      return getLangResource(langDir, opt).then((function(_this) {
        return function(langResource) {
          var _filename_, _filepath_, _langs_, content, extDef, fileInfo;
          if (opt.fallback) {
            opt._fallbackProperties = langResource[opt.fallback];
          }
          _langs_ = langResource.LANG_LIST;
          if (file._lang_ && file.runId === runId) {
            _filename_ = path.basename(file.path);
            _filepath_ = getRelativeFilePath(file.path, file.base);
            fileInfo = {
              _lang_: file._lang_,
              _langs_: _langs_,
              _default_lang_: opt.defaultLang || '',
              _filename_: _filename_,
              _filepath_: _filepath_
            };
            extDef = opt.extendDefination ? opt.extendDefination(fileInfo) : {};
            content = replaceProperties(file.contents.toString(), extend(extDef, langResource[file._lang_], fileInfo), opt);
            file.contents = new Buffer(content);
            _this.push(file);
          } else {
            file.runId = runId;
            _langs_.forEach(function(lang) {
              var newFile, newFilePath, originPath, ref, trace, tracePath;
              originPath = file.path;
              newFilePath = originPath.replace(/\.src\.html$/, '\.html');
              fileInfo = {
                _lang_: lang,
                _langs_: _langs_,
                _default_lang_: opt.defaultLang || ''
              };
              extDef = opt.extendDefination ? opt.extendDefination(fileInfo) : {};
              if (opt.createLangDirs) {
                newFilePath = path.join(resolveFileBase(file.base), lang, getRelativeFilePath(newFilePath, file.base));
                if (opt.filenameI18n) {
                  newFilePath = replaceProperties(newFilePath, extend(extDef, langResource[lang], fileInfo), opt);
                }
              } else if (opt.inline) {
                newFilePath = originPath;
              } else {
                if (opt.filenameI18n) {
                  newFilePath = replaceProperties(newFilePath, extend(extDef, langResource[lang], fileInfo), opt);
                } else {
                  newFilePath = replaceExt(newFilePath, seperator + lang + path.extname(originPath));
                }
              }
              _filename_ = path.basename(newFilePath);
              _filepath_ = getRelativeFilePath(newFilePath, file.base);
              fileInfo = extend({
                _filename_: _filename_,
                _filepath_: _filepath_
              }, fileInfo);
              extDef = opt.extendDefination ? opt.extendDefination(fileInfo) : {};
              content = replaceProperties(file.contents.toString(), extend(extDef, langResource[lang], fileInfo), opt);
              if (opt.trace) {
                tracePath = path.relative(CWD, originPath);
                if ((ref = path.extname(originPath).toLowerCase()) === '.html' || ref === '.htm' || ref === '.xml') {
                  trace = '<!-- trace:' + tracePath + ' -->';
                  if (/(<body[^>]*>)/i.test(content)) {
                    content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
                  } else {
                    content = trace + EOL + content;
                  }
                } else {
                  trace = '/* trace:' + tracePath + ' */';
                  content = trace + EOL + content;
                }
              }
              newFile = new Vinyl({
                base: file.base,
                cwd: file.cwd,
                path: newFilePath,
                contents: new Buffer(content)
              });
              newFile._lang_ = lang;
              newFile._originPath_ = originPath;
              newFile._i18nPath_ = newFilePath;
              if (file.sourceMap) {
                newFile.sourceMap = file.sourceMap;
              }
              _this.push(newFile);
              if (opt.createLangDirs && lang === opt.defaultLang) {
                newFilePath = originPath.replace(/\.src\.html$/, '\.html');
                newFile = new Vinyl({
                  base: file.base,
                  cwd: file.cwd,
                  path: newFilePath,
                  contents: new Buffer(content)
                });
                newFile._lang_ = lang;
                newFile._originPath_ = originPath;
                newFile._i18nPath_ = newFilePath;
                if (file.sourceMap) {
                  newFile.sourceMap = file.sourceMap;
                }
                return _this.push(newFile);
              }
            });
          }
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new PluginError('gulp-html-i18n', err));
        };
      })(this)).done(function() {
        if (opt.renderEngine === 'mustache') {
          return restoreMustacheLookup();
        }
      });
    });
  };

  module.exports.resolveReference = function(opt) {
    var langDir;
    if (opt == null) {
      opt = {};
    }
    if (!opt.langDir) {
      throw new PluginError('gulp-html-i18n:resolveReference', 'Please specify langDir');
    }
    if (opt.delimiters && 'array' === typeof opt.delimiters) {
      throw new PluginError('gulp-html-i18n:resolveReference', 'Delimiters must be an array');
    }
    if (opt.renderEngine && !engines[opt.renderEngine]) {
      throw new PluginError('gulp-html-i18n:resolveReference', 'Render engine `' + opt.renderEngine + '` is not supported. Please use `regex` or `mustache`');
    }
    if (opt.delimiters && !opt.langRegExp) {
      opt.langRegExp = createRegExpFromDelimiters(opt.delimiters);
    }
    if (opt.renderEngine === 'mustache') {
      wrapMustacheLookUp();
    }
    langDir = path.resolve(CWD, opt.langDir);
    return through.obj(function(file, enc, next) {
      var lang, relPath;
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n:resolveReference', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n:resolveReference', 'Streams not supported'));
      }
      relPath = path.relative(langDir, file.path);
      if (relPath.indexOf('.') === 0) {
        return this.emit('error', new PluginError('gulp-html-i18n:resolveReference', 'Not language resource file'));
      }
      lang = relPath.split('/')[0];
      return getLangResource(langDir, opt).then((function(_this) {
        return function(langResource) {
          var _filename_, _filepath_, _langs_, content, extDef, fileInfo;
          _langs_ = langResource.LANG_LIST;
          _filename_ = path.basename(file.path);
          _filepath_ = getRelativeFilePath(file.path, file.base);
          fileInfo = {
            _lang_: lang,
            _langs_: _langs_,
            _default_lang_: opt.defaultLang || '',
            _filename_: _filename_,
            _filepath_: _filepath_
          };
          extDef = opt.extendDefination ? opt.extendDefination(fileInfo) : {};
          content = replaceProperties(file.contents.toString(), extend(extDef, langResource[lang], fileInfo), extend({
            _resolveReference: true
          }, opt));
          file.contents = new Buffer(content);
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new PluginError('gulp-html-i18n', err));
        };
      })(this)).done(function() {
        if (opt.renderEngine === 'mustache') {
          return restoreMustacheLookup();
        }
      });
    });
  };

  module.exports.restorePath = function() {
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n:restorePath', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n:restorePath', 'Streams not supported'));
      }
      if (file._originPath_) {
        file.path = file._originPath_;
      }
      if (file.sourceMap) {
        newFile.sourceMap = file.sourceMap;
      }
      this.push(file);
      return next();
    });
  };

  module.exports.i18nPath = function() {
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n:i18nPath', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n:i18nPath', 'Streams not supported'));
      }
      if (file._i18nPath_) {
        file.path = file._i18nPath_;
      }
      this.push(file);
      return next();
    });
  };

  module.exports.jsonSortKey = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      var contents, convert, keyStack, obj;
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n:jsonSortKey', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n:jsonSortKey', 'Streams not supported'));
      }
      convert = function(obj, objKey) {
        var keys, res;
        keyStack.push(objKey);
        if (!obj || typeof obj !== 'object') {
          res = obj;
        } else if (Array.isArray(obj)) {
          res = obj.map(function(item, i) {
            return convert(item, i);
          });
        } else if (opt.reserveOrder && opt.reserveOrder(keyStack) === true) {
          res = obj;
        } else {
          res = {};
          keys = Object.keys(obj).sort();
          keys.forEach(function(key) {
            return res[key] = convert(obj[key], key);
          });
        }
        keyStack.pop();
        return res;
      };
      keyStack = [];
      contents = file.contents.toString();
      obj = JSON.parse(contents);
      obj = convert(obj);
      contents = JSON.stringify(obj, null, 2);
      if (opt.endWithNewline) {
        contents = contents + EOL;
      }
      file.contents = new Buffer(contents);
      this.push(file);
      return next();
    });
  };

  module.exports.validateJsonConsistence = function(opt) {
    var langDir, langList;
    if (opt == null) {
      opt = {};
    }
    if (!opt.langDir) {
      throw new PluginError('gulp-html-i18n:validateJsonConsistence', 'Please specify langDir');
    }
    langDir = path.resolve(CWD, opt.langDir);
    langList = fs.readdirSync(langDir);
    langList = langList.filter(function(lang) {
      var dir;
      dir = path.resolve(langDir, lang);
      return fs.statSync(dir).isDirectory();
    });
    return through.obj(function(file, enc, next) {
      var compare, compareLangList, currentLang, filePath, keyStack, langFileName, obj, tmp;
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-i18n:validateJsonConsistence', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-i18n:validateJsonConsistence', 'Streams not supported'));
      }
      compare = (function(_this) {
        return function(src, target, targetFilePath, compareKey) {
          var error, srcType, targetType;
          error = function() {
            log(chalk.red('"' + keyStack.join('.') + '" not consistence in files:' + EOL + filePath + EOL + targetFilePath));
            return _this.emit('error', new PluginError('gulp-html-i18n:validateJsonConsistence', 'validateJsonConsistence failed'));
          };
          keyStack.push(compareKey);
          srcType = typeof src;
          targetType = typeof target;
          if (srcType !== targetType || Array.isArray(src) && !Array.isArray(target)) {
            return error();
          }
          if (Array.isArray(src)) {
            src.forEach(function(item, i) {
              return compare(src[i], target[i], targetFilePath, i);
            });
          } else if (src && srcType === 'object') {
            Object.keys(src).forEach(function(key) {
              return compare(src[key], target[key], targetFilePath, key);
            });
          }
          return keyStack.pop();
        };
      })(this);
      filePath = file.path;
      tmp = filePath.slice(langDir.length).replace(/^[\/\\]+/, '').split(path.sep);
      currentLang = tmp.shift();
      if (indexOf.call(langList, currentLang) >= 0) {
        langFileName = tmp.join(path.sep);
        compareLangList = langList.filter(function(lang) {
          return lang !== currentLang;
        });
        obj = require(filePath);
        keyStack = [];
        compareLangList.forEach(function(lang) {
          var compareFilePath, compareObj;
          compareFilePath = [langDir, lang, langFileName].join(path.sep);
          compareObj = require(compareFilePath);
          return compare(obj, compareObj, compareFilePath, '');
        });
      }
      this.push(file);
      return next();
    });
  };

  module.exports.engines = engines;

  module.exports.handleUndefined = handleUndefined;

}).call(this);
