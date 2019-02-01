
<img src="https://rawgit.com/gemstonejs/gemstone-artwork/master/gemstone-logo-white.svg" width="300" align="right" alt=""/>

Gemstone Tool: Frontend
=======================

<p/>
<img src="https://nodei.co/npm/gemstone-tool-frontend.png?downloads=true&stars=true" alt=""/>
<p/>
<img src="https://david-dm.org/rse/gemstone-tool-frontend.png" alt=""/>

About
-----

This is the Gemstone Tool plugin for Frontend Tools of the
[Gemstone JavaScript Technology Stack](http://gemstonejs.com).

Usage
-----

```shell
$ npm install -g gemstone-tool
$ npm install -h gemstone-tool-frontend
$ gemstone frontend-build [...]
```

```js
const Gemstone = require("gemstone-tool")
let gemstone = new Gemstone({ verbose: true, color: true })
gemstone.use("frontend-build").exec("build", { ... }, [ ... ]).then((output) => {
    ...
}).catch((err) => {
    ...
})
```

Copyright &amp; License
-----------------------

Copyright &copy; 2016-2019 [Gemstone Project](http://gemstonejs.com)<br/>
Licensed under [Apache License 2.0](https://spdx.org/licenses/Apache-2.0)

