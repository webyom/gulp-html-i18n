# gulp-html-i18n
Internationalize your HTML files with [gulp](http://gulpjs.com/)!

[![Build Status](https://travis-ci.org/webyom/gulp-html-i18n.svg?branch=master)](https://travis-ci.org/webyom/gulp-html-i18n)
[![codecov](https://codecov.io/gh/webyom/gulp-html-i18n/branch/master/graph/badge.svg)](https://codecov.io/gh/webyom/gulp-html-i18n)


## Language Definition Files

`gulp-html-i18n` supports three formats for definition files: JavaScript, JSON, and YAML

### JS
Given the following in a file named: `lang/en-US/index.js`

#### AMD

```js
define({
  heading: "Welcome!",
  footer:  "Copyright 2015"
});
```

#### CommonJS

```js
module.exports = {
  heading: "Welcome!",
  footer:  "Copyright 2015"
};
```

`gulp-html-i18n` will produce an object called `index`. You can then use
`${{ index.heading }}$` to get a result of "Welcome!".

### JSON
Given the following in a file named: `lang/en-US/index.json`

```json
{
  "heading": "Welcome!",
  "footer":  "Copyright 2015"
}
```

`gulp-html-i18n` will produce an object called `index`. You can then use
`${{ index.heading }}$` to get a result of "Welcome!".

### YAML
Given the following in a file named: `lang/en-US/index.yaml`

```yaml
heading: Welcome!
footer:  Copyright 2015
```

`gulp-html-i18n` will produce an object called `index`. You can then use
`${{ index.heading }}$` to get a result of "Welcome!".

## HTML Markup
To use either of the examples from above, replace the text in your HTML files
with a formatted tag: `${{ library.tag.name }}$`

`${{ _lang_ }}$`, `${{ _langs_ }}$`, `${{ _default_lang_ }}$`, `${{ _filename_ }}$`, and `${{ _filepath_ }}$` are special markups, stand for current file language, all file languages, the `defaultLang` option, the output file name and the output file path relative to `file.base`.

### Example: index.html

Initial:

```html
<html>
  <body>
    <h1>${{ index.heading }}$</h1>
    <div>
      <!-- Website content -->
    </div>
    <div>${{ index.footer }}$</div>
  <body>
</html>
```

Output:

```html
<html>
  <body>
    <h1>Welcome!</h1>
    <div>
      <!-- Website content -->
    </div>
    <div>Copyright 2015</div>
  <body>
</html>
```

## Render Engine

`gulp-html-i18n` supports two renderEngines: regex, [mustache](https://github.com/janl/mustache.js)

### Regex

This is the default and is used either with the langRegExp (the most flexible) or delimiters (easier)

### Mustache

Provides additional support for things like loops and conditionals. [(for full mustache documentation)](https://github.com/janl/mustache.js)
You **must** used delimiters for mustache, you **cannot** use langRegExp option

en/index.yaml [ Yaml is useful for multiline strings ]
```yaml
home:
    paragraphs:
        - >
            First paragraph contents 
            put together in multiple lines
        - >
            Second paragraph
            also in multiple lines
        - Third Paragraph
```

gulpfile.js
```js
i18n({
  langDir: './lang',
  renderEngine: 'mustache'
})
```

index.html
```html
<h1>Welcome</h1>
${{# home.paragraphs }}$
    <p>${{ . }}$</p>
${{/ home.paragraphs }}$
```

Will produce : index-en.html
```html
<h1>Welcome</h1>
<p>First paragraph contents put together in multiple lines</p>
<p>Second paragraph also in multiple lines</p>
<p>Third Paragraph</p>
```

## Gulp Usage

The following task:

```js
gulp.task('build:localize', function() {
  var dest  = './public';
  var index = './index.html';

  return gulp.src(index)
    .pipe(i18n({
      langDir: './lang',
      trace: true
    }))
    .pipe(gulp.dest(dest));
});
```

will compile `index.html` to `public/index-{lang}.html` for each language your
define in `./lang`.

## Options

Option | Default | Type | Description
-------|---------|------|------------
**langDir** (required)| undefined | String | Specifies the path to find definitions
filenameI18n | false | Boolean | If `true`, you can use `${{ xxx }}$` tag in your filename as in the file content, then the translated filename will contain the translated content instead of the language code.
createLangDirs | false | Boolean | If `true`, instead of translating `index.html` into `index-en.html`, etc, will translate to `en/index.html`, etc.
defaultLang | undefined | String | If defined and `createLangDirs` is `true`, translate `index.html` into `index.html` with the default language, etc.
renderEngine | regex | String | If given sets rendering to be done by regex or Mustache (for more functionality)
delimiters | ['${{','}}$'] | String[] | Can be used instead of `langRegExp`. Required to update mustache engine, langRegExp will not work with mustache
failOnMissing | false | Boolean | If `true`, any undefined tag found in an HTML file will throw an error. When `false`, missing tags are logged, but the process finishes.
fallback | undefined | String | If given, will use the provided language as a fallback: For any other language, if a given tag's value is not provided, it will use the fallback language value.
inline | undefined | String | If given, will use the provided language to create an output file of the same name as input. For example, passing `inline: 'en-US'` for `index.html` will result in `index.html` with English replacements.
langRegExp | /\${{ ?([\w\-\.]+) ?}}\$/g | RegExp | the regular expression used for matching the language tags.
escapeQuotes | false | Boolean | If `true`, will replace `"` and `'` with `\\"` and `\\'`.
trace | false | Boolean | If `true`, will place comments in output HTML to show where the translated strings came from
extendDefination | undefined | Function | return an object to extend the language defination
