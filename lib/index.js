(function() {
  var EOL, Q, async, createRegExpFromDelimiters, defaultDelimiters, defaultLangRegExp, defaultRenderEngine, engines, extend, fs, getLangResource, getProperty, gutil, handleUndefined, mustache, mustacheReplaceProperties, path, regexReplaceProperties, replaceProperties, supportedType, through,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  extend = require('extend');

  mustache = require('mustache');

  EOL = '\n';

  defaultLangRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g;

  defaultDelimiters = ['${{', '}}$'];

  defaultRenderEngine = 'regex';

  supportedType = ['.js', '.json'];

  mustache.Context.prototype._lookup = mustache.Context.prototype.lookup;

  mustache.Context.prototype.lookup = function(name) {
    var value;
    value = this._lookup(name);
    if (value === null || !value) {
      this.handleUndefined(name, this.opt);
    }
    return value;
  };

  getProperty = function(propName, properties, opt) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
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
      throw propName + " not found in definition file!";
    } else {
      return gutil.log(gutil.colors.red(propName + " not found in definition file!"));
    }
  };

  regexReplaceProperties = function(langRegExp, delimiters, content, properties, opt, lv) {
    return content.replace(langRegExp, function(full, propName) {
      var res;
      res = getProperty(propName, properties, opt);
      if (typeof res !== 'string') {
        if (!opt.fallback) {
          res = '*' + propName + '*';
        } else {
          res = '${{ ' + propName + ' }}$';
        }
      } else if (langRegExp.test(res)) {
        if (lv > 3) {
          res = '**' + propName + '**';
        } else {
          res = regexReplaceProperties(res, properties, opt, lv + 1);
        }
      }
      return res;
    });
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
    if (!properties) {
      return content;
    }
    return engines[renderEngine](langRegExp, delimiters, content, properties, opt, lv);
  };

  getLangResource = (function() {
    var define, getJSONResource, getJsResource, getResource, getResourceFile, langResource, require;
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
      var e, error1, res;
      try {
        if (path.extname(filePath) === '.js') {
          res = getJsResource(filePath);
        } else if (path.extname(filePath) === '.json') {
          res = getJSONResource(filePath);
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
    getResource = function(langDir) {
      return Q.Promise(function(resolve, reject) {
        var fileList, res;
        if (fs.statSync(langDir).isDirectory()) {
          res = {};
          fileList = fs.readdirSync(langDir);
          return async.each(fileList, function(filePath, cb) {
            var ref;
            if (ref = path.extname(filePath), indexOf.call(supportedType, ref) >= 0) {
              filePath = path.resolve(langDir, filePath);
              res[path.basename(filePath).replace(/\.js(on)?$/, '')] = getResourceFile(filePath);
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
      throw new gutil.PluginError('gulp-html-i18n', 'Please specify langDir');
    }
    if (opt.delimiters && 'array' === typeof opt.delimiters) {
      throw new gutil.PluginError('gulp-html-i18n', 'Delimiters must be an array');
    }
    if (opt.renderEngine && !engines[opt.renderEngine]) {
      console.log(engines);
      throw new gutil.PluginError('gulp-html-i18n', 'Render engine `' + opt.renderEngine + '` is not supported. Please use `regex` or `mustache`');
    }
    if (opt.delimiters && !opt.langRegExp) {
      opt.langRegExp = createRegExpFromDelimiters(opt.delimiters);
    }
    runId = Math.random();
    langDir = path.resolve(process.cwd(), opt.langDir);
    seperator = opt.seperator || '-';
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
      }
      return getLangResource(langDir, opt).then((function(_this) {
        return function(langResource) {
          var content;
          if (file._lang_ && file.runId === runId) {
            content = replaceProperties(file.contents.toString(), extend({}, langResource[file._lang_], {
              _lang_: file._lang_,
              _default_lang_: opt.defaultLang || ''
            }), opt);
            file.contents = new Buffer(content);
            _this.push(file);
          } else {
            file.runId = runId;
            langResource.LANG_LIST.forEach(function(lang) {
              var newFile, newFilePath, originPath, ref, trace, tracePath;
              originPath = file.path;
              newFilePath = originPath.replace(/\.src\.html$/, '\.html');
              if (opt.createLangDirs) {
                newFilePath = file.base + lang + '/' + newFilePath.slice(file.base.length);
                if (opt.filenameI18n) {
                  newFilePath = replaceProperties(newFilePath, extend({}, langResource[lang], {
                    _lang_: lang,
                    _default_lang_: opt.defaultLang || ''
                  }), opt);
                }
              } else if (opt.inline) {
                newFilePath = originPath;
              } else {
                if (opt.filenameI18n) {
                  newFilePath = replaceProperties(newFilePath, extend({}, langResource[lang], {
                    _lang_: lang,
                    _default_lang_: opt.defaultLang || ''
                  }), opt);
                } else {
                  newFilePath = gutil.replaceExtension(newFilePath, seperator + lang + path.extname(originPath));
                }
              }
              content = replaceProperties(file.contents.toString(), extend({}, langResource[lang], {
                _lang_: lang,
                _default_lang_: opt.defaultLang || ''
              }), opt);
              if (opt.fallback) {
                content = replaceProperties(content, extend({}, langResource[opt.fallback], {
                  _lang_: lang,
                  _default_lang_: opt.defaultLang || ''
                }), opt);
              }
              if (opt.trace) {
                tracePath = path.relative(process.cwd(), originPath);
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
              newFile = new gutil.File({
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
                newFile = new gutil.File({
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
          return _this.emit('error', new gutil.PluginError('gulp-html-i18n', err));
        };
      })(this)).done();
    });
  };

  module.exports.restorePath = function() {
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
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
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
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
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
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
      throw new gutil.PluginError('gulp-html-i18n', 'Please specify langDir');
    }
    langDir = path.resolve(process.cwd(), opt.langDir);
    langList = fs.readdirSync(langDir);
    langList = langList.filter(function(lang) {
      var dir;
      dir = path.resolve(langDir, lang);
      return fs.statSync(dir).isDirectory();
    });
    return through.obj(function(file, enc, next) {
      var compare, compareLangList, currentLang, filePath, keyStack, langFileName, obj, tmp;
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
      }
      compare = (function(_this) {
        return function(src, target, targetFilePath, compareKey) {
          var error, srcType, targetType;
          error = function() {
            gutil.log(gutil.colors.red('"' + keyStack.join('.') + '" not consistence in files:' + EOL + filePath + EOL + targetFilePath));
            return _this.emit('error', new gutil.PluginError('gulp-html-i18n', 'validateJsonConsistence failed'));
          };
          keyStack.push(compareKey);
          srcType = typeof src;
          targetType = typeof target;
          if (srcType !== targetType || Array.isArray(src) && !Array.isArray(target)) {
            error();
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
      tmp = filePath.slice(langDir.length).replace(/^\/+/, '').split('/');
      currentLang = tmp.shift();
      if (indexOf.call(langList, currentLang) >= 0) {
        langFileName = tmp.join('/');
        compareLangList = langList.filter(function(lang) {
          return lang !== currentLang;
        });
        obj = require(filePath);
        keyStack = [];
        compareLangList.forEach(function(lang) {
          var compareFilePath, compareObj;
          compareFilePath = [langDir, lang, langFileName].join('/');
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
