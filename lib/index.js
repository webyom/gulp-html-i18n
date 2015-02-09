(function() {
  // Package imports
  var Q       = require('q');
  var async   = require('async');
  var fs      = require('fs');
  var gutil   = require('gulp-util');
  var path    = require('path');
  var through = require('through2');

  var EOL           = '\n';
  var langRegExp    = /\${{ ?([\w\-\.]+) ?}}\$/g;
  var supportedType = ['.js', '.json'];

  var getLangResource;
  var getProperty;
  var replaceProperties;

  /**
   * Convert a property name into a reference to the definition
   */
  getProperty = function(propName, properties) {
    var tmp = propName.split('.');
    var res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];

      if (res === undefined) {
        console.log(propName, 'not found in definition file!');
      }
    }
    return res;
  };

  /**
   * Does the actual work of substituting tags for definitions
   */
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

  /**
   * Load the definitions for all languages
   */
  getLangResource = (function() {
    var define;
    var getResource;
    var getResourceFile;
    var langResource;
    var require;

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

    /**
     * Open a file from the language dir and set up definitions from that file
     */
    getResourceFile = function(filePath) {
      var e;
      var res;
      try {
        if (path.extname(filePath) === '.json') {
          res = getJSONResource(filePath);
        } else if (path.extname(filePath) === '.js') {
          res = getJsResource(filePath);
        }
      } catch (_error) {
        e = _error;
        throw new Error('Language file "' + filePath + '" syntax error! - ' +
          e.toString());
      }

      return res;
    };

    getJsResource = function(filePath) {
      var res = eval(fs.readFileSync(filePath).toString());

      if (typeof res === 'function') {
        res = res();
      }

      return res;
    };

    getJSONResource = function(filePath) {
      return define(JSON.parse(fs.readFileSync(filePath).toString()));
    };

    /**
     *
     */
    getResource = function(langDir) {
      return Q.Promise(function(resolve, reject) {
        var fileList;
        var res;

        if (fs.statSync(langDir).isDirectory()) {
          res = {};
          fileList = fs.readdirSync(langDir);

          return async.each(fileList, function(filePath, cb) {
            if (supportedType.indexOf(path.extname(filePath)) > -1) {
              filePath = path.resolve(langDir, filePath);
              res[path.basename(filePath).replace(/\.js(on)?$/, '')] =
                getResourceFile(filePath);
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
        var langList;
        var res;
        if (langResource) {
          return resolve(langResource);
        }
        res = {
          LANG_LIST: []
        };
        langList = fs.readdirSync(dir);
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

  /**
   * Gulp function exported to handle translation
   */
  module.exports = function(opt) {
    var langDir;
    var seperator;

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
        return this.emit('error',
          new gutil.PluginError('gulp-html-i18n', 'File can\'t be null'));
      }

      if (file.isStream()) {
        return this.emit('error',
          new gutil.PluginError('gulp-html-i18n', 'Streams not supported'));
      }

      return getLangResource(langDir).then((function(_this) {
        return function(langResource) {
          var content;

          if (file._lang_) {
            content = replaceProperties(
              file.contents.toString(),
              langResource[file._lang_]
            );

            file.contents = new Buffer(content);
            _this.push(file);
          } else {
            langResource.LANG_LIST.forEach(function(lang) {
              var newFile;
              var trace;

              var originPath = file.path;
              var newFilePath = originPath.replace(/\.src\.html$/, '\.html');

              /**
               * If the option `createLangDirs` is set, save path/foo.html
               * to path/lang/foo.html. Otherwise, save to path/foo-lang.html
               */
              if (opt.createLangDirs) {
                newFilePath = path.resolve(
                  path.dirname(newFilePath),
                  lang,
                  path.basename(newFilePath)
                );
              } else {
                newFilePath = gutil.replaceExtension(
                  newFilePath,
                  seperator + lang + '.html'
                );
              }

              //
              content = replaceProperties(
                file.contents.toString(),
                langResource[lang]
              );

              if (opt.trace) {
                trace = '<!-- trace:' +
                  path.relative(process.cwd(), originPath) +
                  ' -->';

                if (/(<body[^>]*>)/i.test(content)) {
                  content = content.replace(
                    /(<body[^>]*>)/i,
                    '$1' + EOL + trace
                  );
                } else {
                  content = trace + EOL + content;
                }
              }

              //
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
          return _this.emit(
            'error',
            new gutil.PluginError('gulp-html-i18n', err)
          );
        };
      })(this)).done();
    });
  };

}).call(this);
