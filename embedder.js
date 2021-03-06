var fs = require('fs');
var path = require('path');

function existsSync(path) {
    try {
        return fs.statSync(path);
    } catch (err) {
        if (err.code === "ENOENT") return false;
        throw err;
    }
}

// Node style package resolving so that plugins' package.json can be found relative to the config file
// It's not the full node require system algorithm, but it's the 99% case
function resolvePackage(base, packagePath) {
    var newPath;
    if (packagePath[0] === "." || packagePath[0] === "/") {
        newPath = path.resolve(base, packagePath, "package.json");
        if (existsSync(newPath)) return newPath;
    }
    else {
        while (base) {
            newPath = path.resolve(base, "node_modules", packagePath, "package.json");
            if (existsSync(newPath)) return newPath;
            base = base.substr(0, base.lastIndexOf("/"));
        }
    }
    throw new Error("Can't find '" + packagePath + "' relative to '" + base + '"');
}

// Takes in an array of npm module names and bundles them (with their declared dependencies) in a single text file, with optional minification.
module.exports = embedder;
function embedder(base, modules, minify) {
  var files = {};

  addPaths(base, modules);

  function addPaths(base, modules) {
    for (var i = 0, l = modules.length; i < l; i++) {
      var module = modules[i];
      var pos = module.indexOf("/");
      var local;
      if (pos > 0) {
        local = module.substr(pos);
        module = module.substr(0, pos);
      }
      var packagePath = resolvePackage(base, module);
      var config = require(packagePath);
      module = config.name;
      var newBase = path.dirname(packagePath);
      if (local) {
        var localPath = path.join(newBase, local + ".js");

        if (!existsSync(localPath)) throw new Error("Missing file " + localPath);
        files[module + local] = localPath;
        continue;
      }
      if (config.main) {
        files[module] = path.resolve(newBase, config.main);
      }
      if (config.dependencies) {
        addPaths(newBase, Object.keys(config.dependencies));
      }
    }
  }

  var parts = [];
  parts.push(fs.readFileSync(require.resolve("./module"), "utf8"));
  for (var name in files) {
    var content = fs.readFileSync(files[name]);
    // Check the syntax of content
    new Function (content);
    parts.push("\ndefine('" + name + "', function (module, exports) {\n\n" + content + "\n});\n");
  }

  var code = parts.join("\n");

  if (!minify) return code;

  var jsp = require("uglify-js").parser;
  var pro = require("uglify-js").uglify;
  var ast = jsp.parse(code); // parse code and get the initial AST
  ast = pro.ast_mangle(ast); // get a new AST with mangled names
  ast = pro.ast_squeeze(ast); // get an AST with compression optimizations
  return pro.gen_code(ast); // compressed code here

}
