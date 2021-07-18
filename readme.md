# Build ES6 javascript to ES5 for PHP server without webpack

# install

```shell
    npm i --save-dev absol-script-builder
```

# Build

***absol.script.build.js***

```js
const JSPureBuilder = require('absol-script-builder/JSPureBuilder');

var b = new JSPureBuilder({
    root: __dirname,
    entry: 'index.js',
    output: './dist',
    indexedFile: 'absol_indexed_source',
    phpVar: '$absol_indexed'
});
```

# How to use output code

## create JS file

```php
<?php
    ob_start();
    header('Content-Type: application/javascript');
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Cache-Control: post-check=0, pre-check=0", false);
    header("Pragma: no-cache");
    include_once "absol_indexed_source.php";
    include_once "jspurewriter.php";
    $writer = new JSPureWriter($absol_indexed);
    $writer->writeScript();
?>
```

## Create css file

```php
<?php
    ob_start();
    header('Content-Type: application/javascript');
    header("Content-type: text/css");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Cache-Control: post-check=0, pre-check=0", false);
    header("Pragma: no-cache");
    include_once "absol_indexed_source.php";
    include_once "jspurewriter.php";
    $writer = new JSPureWriter($absol_indexed);
    $writer->writeCSS();
?>
```

## Write to HTML



TODO