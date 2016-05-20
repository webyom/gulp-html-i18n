(function() {
  var EOL, Q, async, defaultLangRegExp, extend, fs, getLangResource, getProperty, gutil, handleUndefined, path, replaceProperties, supportedType, through,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  extend = require('extend');

  EOL = '\n';

  defaultLangRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g;

  supportedType = ['.js', '.json'];

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
      return console.warn(propName + " not found in definition file!");
    }
  };

  replaceProperties = function(content, properties, opt, lv) {
    var langRegExp;
    lv = lv || 1;
    langRegExp = opt.langRegExp || defaultLangRegExp;
    if (!properties) {
      return content;
    }
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
          res = replaceProperties(res, properties, opt, lv + 1);
        }
      }
      return res;
    });
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
      var e, error, res;
      try {
        if (path.extname(filePath) === '.js') {
          res = getJsResource(filePath);
        } else if (path.extname(filePath) === '.json') {
          res = getJSONResource(filePath);
        }
      } catch (error) {
        e = error;
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

  module.exports = function(opt) {
    var langDir, seperator;
    if (opt == null) {
      opt = {};
    }
    if (!opt.langDir) {
      throw new gutil.PluginError('gulp-html-i18n', 'Please specify langDir');
    }
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
          if (file._lang_) {
            content = replaceProperties(file.contents.toString(), extend({}, langResource[file._lang_], {
              _lang_: file._lang_,
              _default_lang_: opt.defaultLang || ''
            }), opt);
            file.contents = new Buffer(content);
            _this.push(file);
          } else {
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

}).call(this);
