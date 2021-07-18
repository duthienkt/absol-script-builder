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

TODO