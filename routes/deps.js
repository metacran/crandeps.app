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

    var deps = {} 		// Contains the results
    var seen = { false: false }	// Keep track of what was queried

    var cranq = async.queue(function(task, callback) {
	if (base_packages.indexOf(task) > -1) {
	    deps[task] = false
	    seen[task] = task
	    callback()
	} else {
	    var url = base_url + '/' + task
	    request(url, function(error, response, body) {
		if (error || response.statusCode != 200) { return handle_error(res); }
		var pkg_obj = JSON.parse(body)
		var task_deps = get_deps(pkg_obj)
		var ver = pkg_obj["Version"]
		var pkg_ver = task + '-' + ver
		deps[pkg_ver] = task_deps
		seen[task] = pkg_ver
		task_deps.map(function(x) {
		    if (! (x in seen)) {
			seen[x] = false
			cranq.push(x)
		    }
		})
		callback();
	    })
	}
    }, 20)

    cranq.drain = function() { return_res(res, deps, seen) }

    var pkg_deps = get_deps(pkg_obj)
    var ver = pkg_obj["Version"]
    seen[pkg] = pkg + '-' + ver
    deps[pkg + '-' + ver] = pkg_deps
    pkg_deps.map(function(x) { seen[x] = false; cranq.push(x) })

    // In case there are no dependencies, 2 because we have
    // the queried package and false: false as well.
    if (Object.keys(seen).length == 2) { return_res(res, deps, seen) }
}

function return_res(res, deps, seen) {
    var keys = Object.keys(deps);

    // Need to add version numbers
    Object.keys(deps).forEach(function(key) {
	var value = deps[key]
	if (value !== false) {
	    deps[key] = value.map(function(y) { return seen[y] })
	}
    })
    res.set(200)
    res.send(JSON.stringify(deps))
    res.end()
}

function handle_error(res) {
    res.set(500);
    res.end('{ "error": "Cannot connect to DB",' +
            '  "email": "csardi.gabor+crandeps@gmail.com" }');
}

module.exports = router;
