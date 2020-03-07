import fs from "fs";

import cjs from "rollup-plugin-cjs-es";
import resolve from "rollup-plugin-node-resolve";
import copy from 'rollup-plugin-copy-glob';
import {terser} from "rollup-plugin-terser";

import glob from "tiny-glob";

export default async () => ({
  input: await glob("src/*.js"),
  output: {
    format: "es",
    dir: "build",
    sourcemap: true
  },
  plugins: [
    resolve(),
    cjs({
      nested: true
    }),
    copy([
      {
        files: "src/static/**/*",
        dest: "build"
      }
    ]),
    terser(),
    injectEntries({
      transforms: [
        {
          test: /background\.js/,
          file: "build/manifest.json",
          transform: (entries, obj) => {
            obj.background.scripts = entries;
            return obj;
          }
        }
      ]
    })
  ]
});

function injectEntries({prefix = "", transforms}) {
  return {
    name: "rollup-plugin-inject-entries",
    writeBundle
  };
  
  function writeBundle(options, bundle) {
    for (const key in bundle) {
      let match, transform;
      for (const trans of transforms) {
        match = key.match(trans.test);
        if (match) {
          transform = trans;
          break;
        }
      }
      if (!match) continue;
      const entries = [
        ...bundle[key].imports.map(f => prefix + f),
        prefix + key
      ];
      const file = transform.file.replace(/\$(\d+)/, (m, n) => match[Number(n)]);
      let content = fs.readFileSync(file, "utf8");
      if (file.endsWith(".json")) {
        content = JSON.parse(content);
      }
      let output = transform.transform(entries, content);
      if (typeof output !== "string") {
        output = JSON.stringify(output, null, 2);
      }
      fs.writeFileSync(file, output);
    }
  }
}
