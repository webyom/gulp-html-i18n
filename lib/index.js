(function() {
  var Q, async, fs, getLangResource, getProperty, gutil, langRegExp, path, replaceProperties, through;

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  langRegExp = /\${{([\w\-\.]+)}}\$/g;

  getProperty = function(propName, properties) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
    }
    return res;
  };

  replaceProperties = function(content, lang, properties, lv) {
    lv = lv || 1;
    if (!properties) {
      return content;
    }
    content.replace(langRegExp, function(full, propName) {
      var res;
      res = getProperty(propName, properties);
      if (typeof res !== 'string') {
        res = '*' + propName + '*';
      } else if (langRegExp.test(res)) {
        if (lv > 3) {
          res = '**' + propName + '**';
        } else {
          res = replaceProperties(res, lang, properties, lv + 1);
        }
      }
      return res;
    });
    return content.replace(/\%{{_lang_}}\%/g, lang);
  };

  getLangResource = (function() {
    var define, getResource, getResourceFile, langResource, require;
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
      var res;
      if (path.extname(filePath) === '.js') {
        try {
          res = eval(fs.readFileSync(filePath).toString('utf8'));
        } catch (_error) {
          throw new Error('Language file "' + filePath + '" syntax error! - ' + e.toString());
        }
        if (typeof res === 'function') {
          res = res();
        }
      }
      return res;
    };
    getResource = function(langDir) {
      return Q.Promise(function(resolve, reject) {
        var fileList, res;
        if (fs.statSync(langDir).isDirectory()) {
          res = {};
          fileList = fs.readdirSync(langDir);
          return async.each(fileList, function(filePath, cb) {
            filePath = path.resolve(langDir, filePath);
            res[path.basename(filePath).replace(/\.js$/, '')] = getResourceFile(filePath);
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
        return async.each(langList, function(langDir, cb) {
          var langCode;
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
      throw new gutil.PluginError('gulp-html-i18n', 'Please spicity langDir');
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
          langResource.LANG_LIST.forEach(function(lang) {
            var content, newFile, newFilePath;
            newFilePath = file.path.replace(/\.src\.html$/, '\.html');
            newFilePath = gutil.replaceExtension(newFilePath, seperator + lang + '.html');
            content = replaceProperties(file.contents.toString('utf8'), lang, langResource[lang]);
            newFile = new gutil.File({
              base: file.base,
              cwd: file.cwd,
              path: newFilePath,
              contents: new Buffer(content)
            });
            return _this.push(newFile);
          });
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
