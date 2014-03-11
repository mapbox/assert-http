Assert HTTP
-----------

Test helpers for testing a HTTP interface. This library contains two primary interfaces; a test runner which executes a set of HTTP calls as described by files in a directory, and a extension to the assert module.

## HTTP testing inferface

With [mocha](http://visionmedia.github.io/mocha/), usage looks like;

```
describe('api server', function(done) {
    fixtures.load('/path/to/tests/`).forEach(function(test) {
        it(test.name, function(done) {
            fixtures.runtest(test, {handlers: handlers, clean: clean}, done);
        });
    });
});
```

### assertHTTP.load(dirname)

Syncronous function that loads text fixtures from a directory. Returns an array of test objects.

### assertHTTP.runtest(test, options, callback)

Runs an individual test. Requires a test object (from assertHTTP.load), options object and callback function. The options object may contain the keys;

* `handlers`; an object of keys and replacer methods for populating http requests. Handlers are async and have the function signature `function(req, value, next)`
* `clean`; an object of keys and replacer methods for sanitizing http response headers and body. Replacer methodes have the signature `function(key, value, context)`

### assertHTTP.updateFixtures()

Call this method to notify assertHTTP to update fixtures as it runs.

### assertHTTP.mkdirpSync(path)

Sync version of mkdirp

### assertHTTP.md5(string)

md5 helper.

## Assertion module extension

### assert.response(req, res, callback)

If `res.clean` is present it is expected to be a method that `json.stringify` can use to sanitize the response headers.
