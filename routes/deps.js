var express = require('express');
var router = express.Router();
var request = require('request');
var async = require('async');

var base_url = 'https://crandb.r-pkg.org';

var base_packages = ["base", "compiler", "datasets", "graphics",
                     "grDevices", "grid", "methods", "parallel",
                     "splines", "stats", "stats4", "tcltk", "tools",
                     "utils"]

var essential_dep_types = [ "Depends", "LinkingTo", "Imports" ];
var optional_dep_types = [ "Suggests", "Enhances" ];
var all_dep_types = essential_dep_types.concat(optional_dep_types);
var dep_types = { 'ess': essential_dep_types,
		  'all': all_dep_types,
		  'allall': all_dep_types };

var re_pkgs = '(\\/(all))?\\/([-\\w0-9\\.,]+)';
var re_full = new RegExp('^' + re_pkgs + '$');

router.get(re_full, function(req, res) {
    var which = req.params[1] || "ess"
    var pkgs = parse_packages(req.params[2])
    res.set('Content-Type', 'application/json');
    do_query(res, pkgs, which);
});

function parse_packages(pkgs) {
    var pkgs = pkgs.split(",").map(function(pkg) {
	var pkg = pkg.split("-")
	return pkg
    })
    return pkgs
}

function do_query(res, pkgs, which) {
    var pkgs_str = pkgs.map(function(x) {
	return(x.join("-"))
    })
    var url = base_url + '/-/versions?keys=' + JSON.stringify(pkgs_str)
    request(url, function (error, response, body) {
	if (error || response.statusCode != 200) { return handle_error(res); }
	var pkg_obj = JSON.parse(body);
	do_package(res, pkg_obj, which)
    })
}

function get_deps(pkg_obj, which) {
    var my_dep_types = dep_types[which];
    var deps = {};
    for (d in my_dep_types) {
	var dd = my_dep_types[d];
	var new_deps = pkg_obj[dd] || { };
	deps[dd] = new_deps;
    }
    return deps;
}

function do_package(res, pkg_obj, which) {

    var deps = {} 		// Contains the results
    var seen = { false: false }	// Keep track of what was queried

    var which2 = which == "allall" ? "allall" : "ess"

    var cranq = async.queue(function(task, callback) {
	if (base_packages.indexOf(task) > -1) {
	    deps[task] = false
	    seen[task] = task
	    callback()
	} else {
	    var url = base_url + '/' + task
	    request(url, function(error, response, body) {
		if (response.statusCode == 404) {
		    deps[task] = null
		    seen[task] = task
		    return callback()
		} else if (error || response.statusCode != 200) {
		    return handle_error(res);
		}
		var pkg_obj = JSON.parse(body)
		var task_deps = get_deps(pkg_obj, which2)
		var ver = pkg_obj["Version"]
		var pkg_ver = task + '-' + ver
		deps[pkg_ver] = task_deps
		seen[task] = pkg_ver
		for (var key in task_deps) {
		    for (var pkg in task_deps[key]) {
			if (pkg != 'R' && ! (pkg in seen)) {
			    seen[pkg] = false
			    cranq.push(pkg)
			}
		    }
		}
		callback();
	    })
	}
    }, 20)

    cranq.drain = function() { return_res(res, deps, seen) }

    for (i in pkg_obj) {
	var pkg = pkg_obj[i]
	var pkg_deps = get_deps(pkg, which)
	var pkg_name = pkg["Package"]
	var pkg_ver = pkg["Version"]
	seen[pkg_name] = pkg_name + '-' + pkg_ver
	deps[pkg_name + '-' + pkg_ver] = pkg_deps
	for (var key in pkg_deps) {
	    for (var pkg in pkg_deps[key]) {
		if (pkg != 'R') {
		    seen[pkg] = false;
		    cranq.push(pkg);
		}
	    }
	}
    }

    // In case there are no dependencies. The plus one is for false: false.
    if (Object.keys(seen).length == Object.keys(pkg_obj).length + 1) {
	return_res(res, deps, seen)
    }
}

function return_res(res, deps, seen) {
    var keys = Object.keys(deps);

    // Need to add version numbers
    for (pkg in deps) {
	for (deptype in deps[pkg]) {
	    for (deppkg in deps[pkg][deptype]) {
		if (deppkg != 'R') {
		    var deppkgver = seen[deppkg];
		    if (deppkgver != deppkg) {
			deps[pkg][deptype][deppkgver] = deps[pkg][deptype][deppkg];
			delete deps[pkg][deptype][deppkg];
		    }
		}
	    }
	}
    }

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
