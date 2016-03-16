(function() {
  var EOL, Q, async, defaultLangRegExp, extend, fs, getLangResource, getProperty, gutil, handleUndefined, options, path, replaceProperties, supportedType, through,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  extend = require('extend');

  EOL = '\n';

  options = void 0;

  defaultLangRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g;

  supportedType = ['.js', '.json'];

  getProperty = function(propName, properties) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
      if (res === void 0) {
        handleUndefined(propName);
      }
    }
    if (res && options.escapeQuotes === true) {
      res = res.replace(/"/g, '\\"');
      res = res.replace(/'/g, "\\'");
    }
    return res;
  };

  handleUndefined = function(propName) {
    if (options.failOnMissing) {
      throw propName + " not found in definition file!";
    } else {
      return console.warn(propName + " not found in definition file!");
    }
  };

  replaceProperties = function(content, properties, lv) {
    var langRegExp;
    lv = lv || 1;
    langRegExp = options.langRegExp || defaultLangRegExp;
    if (!properties) {
      return content;
    }
    return content.replace(langRegExp, function(full, propName) {
      var res;
      res = getProperty(propName, properties);
      if (typeof res !== 'string') {
        if (!options.fallback) {
          res = '*' + propName + '*';
        } else {
          res = '${{ ' + propName + ' }}$';
        }
      } else if (langRegExp.test(res)) {
        if (lv > 3) {
          res = '**' + propName + '**';
        } else {
          res = replaceProperties(res, properties, lv + 1);
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
    return getLangResource = function(dir) {
      return Q.Promise(function(resolve, reject) {
        var langList, res;
        if (langResource) {
          return resolve(langResource);
        }
        res = {
          LANG_LIST: []
        };
        langList = fs.readdirSync(dir);
        if (options.inline) {
          if (fs.statSync(path.resolve(dir, options.inline)).isDirectory()) {
            langList = [options.inline];
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
    options = opt;
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
      return getLangResource(langDir).then((function(_this) {
        return function(langResource) {
          var content;
          if (file._lang_) {
            content = replaceProperties(file.contents.toString(), extend({}, langResource[file._lang_], {
              _lang_: file._lang_,
              _default_lang_: opt.defaultLang || ''
            }));
            file.contents = new Buffer(content);
            _this.push(file);
          } else {
            langResource.LANG_LIST.forEach(function(lang) {
              var newFile, newFilePath, originPath, trace, tracePath;
              originPath = file.path;
              newFilePath = originPath.replace(/\.src\.html$/, '\.html');
              if (opt.createLangDirs) {
                if (opt.defaultLang !== lang) {
                  newFilePath = file.base + lang + '/' + newFilePath.slice(file.base.length);
                }
              } else if (opt.inline) {
                newFilePath = originPath;
              } else {
                newFilePath = gutil.replaceExtension(newFilePath, seperator + lang + '.html');
              }
              content = replaceProperties(file.contents.toString(), extend({}, langResource[lang], {
                _lang_: lang,
                _default_lang_: opt.defaultLang || ''
              }));
              if (options.fallback) {
                content = replaceProperties(content, extend({}, langResource[options.fallback], {
                  _lang_: lang,
                  _default_lang_: opt.defaultLang || ''
                }));
              }
              if (opt.trace) {
                tracePath = path.relative(process.cwd(), originPath);
                trace = '<!-- trace:' + tracePath + ' -->';
                if (/(<body[^>]*>)/i.test(content)) {
                  content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
                } else {
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
              return _this.push(newFile);
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

}).call(this);
