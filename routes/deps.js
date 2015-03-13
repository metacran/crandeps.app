var express = require('express');
var router = express.Router();
var request = require('request');
var async = require('async');

var base_url = 'https://crandb.r-pkg.org';

var base_packages = ["base", "compiler", "datasets", "graphics",
                     "grDevices", "grid", "methods", "parallel",
                     "splines", "stats", "stats4", "tcltk", "tools",
                     "utils"]

var re_pkg = '\\/([\\w\\.]+)';
var re_ver = '(?:\\/([0-9\\.]+))?';
var re_full = new RegExp('^' + re_pkg + re_ver + '$');

router.get(re_full, function(req, res) {
    var pkg = req.params[0];
    var ver = req.params[1];
    res.set('Content-Type', 'application/json');
    do_query(res, pkg, ver);
});

function do_query(res, pkg, ver) {
    var url = base_url + '/' + pkg;
    url += ver ? ('/' + ver) : '';
    request(url, function (error, response, body) {
	if (error || response.statusCode != 200) { return handle_error(res); }
	var pkg_obj = JSON.parse(body);
	do_package(res, pkg_obj, pkg)
    })
}

function get_deps(pkg_obj) {
    var deps = Object.keys(pkg_obj["Depends"] || [])
	.concat(Object.keys(pkg_obj["LinkingTo"] || []))
	.concat(Object.keys(pkg_obj["Imports"] || []));
    var rindex = deps. indexOf('R');
    if (rindex > -1) deps.splice(rindex, 1);
    return deps;
}

function do_package(res, pkg_obj, pkg) {

    // This will contain the results
    var deps = {}

    var cranq = async.queue(function(task, callback) {
	if (base_packages.indexOf(task) > -1) {
	    deps[task] = false
	    callback()
	} else {
	    var url = base_url + '/' + task
	    request(url, function(error, response, body) {
		if (error || response.statusCode != 200) { return handle_error(res); }
		var task_deps = get_deps(JSON.parse(body))
		deps[task] = task_deps
		task_deps.map(function(x) {
		    if (! (x in deps)) {
			deps[x] = false
			cranq.push(x)
		    }
		})
		callback();
	    })
	}
    }, 20)

    cranq.drain = function() {
	res.set(200)
	res.send(JSON.stringify(deps))
	res.end()
    }

    var pkg_deps = get_deps(pkg_obj)
    deps[pkg] = pkg_deps
    pkg_deps.map(function(x) { deps[x] = false; cranq.push(x) })
}

function handle_error(res) {
    res.set(500);
    res.end('{ "error": "Cannot connect to DB",' +
            '  "email": "csardi.gabor+crandeps@gmail.com" }');
    throw "Internal error"
}

module.exports = router;
