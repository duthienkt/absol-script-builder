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

absol-full-js.php

```php
<?php
    include_once "absol_indexed_source.php";

    $DONT_CACHE = false;
    ob_start();
    header('Content-Type: application/javascript');

    $mtime =  $absol_indexed["js_mtime"];
    $etag = md5($mtime);
    header("Last-Modified: ".$mtime);
    header('ETag: "' .$etag.'"');

    if ($DONT_CACHE){
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Cache-Control: post-check=0, pre-check=0", false);
        header("Pragma: no-cache");
    }
    else {
        // header("Cache-Control: max-age=3600");
        $if_modified_since = isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) ? $_SERVER['HTTP_IF_MODIFIED_SINCE'] : false;
        $if_none_match = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? $_SERVER['HTTP_IF_NONE_MATCH'] : false;
        if ((($if_none_match && $if_none_match == $etag) || (!$if_none_match)) &&
            ($if_modified_since && $if_modified_since == $mtime))
        {
            header('HTTP/1.1 304 Not Modified');
            exit();
        }
    }

    include_once "jspurewriter.php";
    $writer = new JSPureWriter($absol_indexed);
    $writer->writeScript();
    // echo "console.log(\"".$absol_indexed["js_mtime"]."\")";
?>
```

## Create css file

absol-full-css.php

```php
<?php
    include_once "absol_indexed_source.php";

    $DONT_CACHE = !isset($_GET["mtime"]);
    ob_start();
    header("Content-type: text/css");
    $mtime =  $absol_indexed["js_mtime"];
    $etag = md5($mtime);
    header("Last-Modified: ".$mtime);
    header('ETag: "' .$etag.'"');

    if ($DONT_CACHE){
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Cache-Control: post-check=0, pre-check=0", false);
        header("Pragma: no-cache");
    }
    else {
        // header("Cache-Control: max-age=3600");
        $if_modified_since = isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) ? $_SERVER['HTTP_IF_MODIFIED_SINCE'] : false;
        $if_none_match = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? $_SERVER['HTTP_IF_NONE_MATCH'] : false;
        if ((($if_none_match && $if_none_match == $etag) || (!$if_none_match)) &&
            ($if_modified_since && $if_modified_since == $mtime))
        {
            header('HTTP/1.1 304 Not Modified');
            exit();
        }
    }

    include_once "jspurewriter.php";
    $writer = new JSPureWriter($absol_indexed);
    $writer->writeStyle();

?>
```

## Write to HTML

```php
<?php
    include_once "absol_indexed_source.php";
    $basePath = substr(str_replace('\\', '/', realpath(dirname(__FILE__))), strlen(str_replace('\\', '/', realpath($_SERVER['DOCUMENT_ROOT']))));
    // echo "<script src=\"./absol.dependents.js?time=".(stat($_SERVER['DOCUMENT_ROOT'].'/absol/absol.dependents.js')['mtime'])."\"></script>";
    echo "<script src=\"".$basePath."/absol.dependents.js?time=".(stat(dirname(__FILE__).'/absol.dependents.js')['mtime'])."\"></script>\n";
    echo "<script type=\"text/javascript\" src=\"".$basePath."/absol-full-js.php?mtime=$absol_indexed_js_mtime_stamp\"></script>\n";

    echo "<link rel=\"stylesheet\" href=\"".$basePath."/absol-full-css.php?mtime=$absol_indexed_css_mtime_stamp\">\n";

?>
?>
```