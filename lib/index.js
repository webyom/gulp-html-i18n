(function() {
  var EOL, Q, async, fs, getLangResource, getProperty, gutil, langRegExp, path, replaceProperties, supportedType, through,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  EOL = '\n';

  langRegExp = /\${{ ?([\w\-\.]+) ?}}\$/g;

  supportedType = ['.js', '.json'];

  getProperty = function(propName, properties) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
      if (res === void 0) {
        console.log(propName, 'not found in definition file!');
      }
    }
    return res;
  };

  replaceProperties = function(content, properties, lv) {
    lv = lv || 1;
    if (!properties) {
      return content;
    }
    return content.replace(langRegExp, function(full, propName) {
      var res;
      res = getProperty(propName, properties);
      if (typeof res !== 'string') {
        res = '*' + propName + '*';
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
      var e, res;
      try {
        if (path.extname(filePath) === '.js') {
          res = getJsResource(filePath);
        } else if (path.extname(filePath) === '.json') {
          res = getJSONResource(filePath);
        }
      } catch (_error) {
        e = _error;
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
            var _ref;
            if (_ref = path.extname(filePath), __indexOf.call(supportedType, _ref) >= 0) {
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
          console.log("will inline " + opt.inline);
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
            console.log("_lang_");
            content = replaceProperties(file.contents.toString(), langResource[file._lang_]);
            file.contents = new Buffer(content);
            _this.push(file);
          } else {
            console.log("loading lang resources");
            langResource.LANG_LIST.forEach(function(lang) {
              var newFile, newFilePath, originPath, trace, tracePath;
              originPath = file.path;
              newFilePath = originPath.replace(/\.src\.html$/, '\.html');
              if (opt.createLangDirs) {
                newFilePath = path.resolve(path.dirname(newFilePath), lang, path.basename(newFilePath));
              } else if (opt.inline) {
                console.log("inlining in " + newFilePath + " with " + opt.inline);
                newFilePath = originPath;
              } else {
                newFilePath = gutil.replaceExtension(newFilePath, seperator + lang + '.html');
              }
              content = replaceProperties(file.contents.toString(), langResource[lang]);
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
