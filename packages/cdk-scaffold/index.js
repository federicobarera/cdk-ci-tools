#!/usr/bin/env node
const prompts = require("prompts");
const fs = require("fs");
const fse = require("fs-extra");
const path = require("path");
prompts.override(require("yargs").argv);
const lodash = require("lodash");

const available_templates = ["empty"];

const doesFileContain = (file, content) => {
  return (
    !!fse.existsSync(file) &&
    fse.readFileSync(file).toString().includes(content)
  );
};

const required = (v) => !!v;

const toMultiChoice = (v) => ({
  title: v,
  value: v,
});

const sync_packages = (
  local_package,
  template_package,
  software_version,
  options
) => {
  Object.keys(template_package.devDependencies).forEach((key) => {
    template_package.devDependencies[key] = template_package.devDependencies[
      key
    ].replace("%package_version%", software_version);
  });

  local_package.devDependencies = local_package.devDependencies || {};
  const override_packages = options.override_packages || [];

  Object.keys(template_package.devDependencies).forEach((key) => {
    if (
      !local_package.devDependencies.hasOwnProperty(key) ||
      override_packages.includes(key)
    )
      local_package.devDependencies[key] =
        template_package.devDependencies[key];
  });

  fs.writeFileSync("./package.json", JSON.stringify(local_package, null, 2));

  [
    ["./.gitignore", "cdk.out/"],
    ["./.eslintignore", "infrastructure/*"],
  ].forEach(([file, content]) => {
    !doesFileContain(file, content) &&
      fse.appendFileSync(file, `\n${content}\n`);
  });
};

const sync_infrastructure = (
  base_template_infrastructure,
  template_infrastructure,
  options
) => {
  base_template_infrastructure.forEach((file) => {
    const dest_abs = path.join("./infrastructure", file);
    const src_abs = path.join(__dirname, "./templates/infrastructure", file);

    fse.copySync(src_abs, dest_abs, {
      overwrite: (options.override_infra || []).includes(file),
    });
  });

  template_infrastructure.forEach((file) => {
    const dest_abs = path.join("./infrastructure", file);
    const src_abs = path.join(__dirname, "./templates", options.template, file);

    fse.copySync(src_abs, dest_abs, {
      overwrite: (options.override_infra || []).includes(file),
    });
  });
};

const sync_cdk_json = (local_cdk_json, options) => {
  const interpolated_cdk_json = Object.keys(options).reduce((acc, v) => {
    return acc.replace(new RegExp(`%${v}%`, "g"), options[v] || "");
  }, fs.readFileSync(path.join(__dirname, "./templates/cdk.json")).toString());

  const cdk_json_obj = JSON.parse(interpolated_cdk_json);
  const merged_cdk_obj = lodash.merge(local_cdk_json, cdk_json_obj);

  fse.writeFileSync("./cdk.json", JSON.stringify(merged_cdk_obj, null, 2));
};

const sync_others = () => {
  ["tsconfig.infrastructure.json", "checkov.yaml"].forEach((file) => {
    fse.copySync(path.join(__dirname, `./templates/${file}`), `./${file}`, {
      overwrite: true,
    });
  });
};

const read_directory_structure_recursive = (
  directory,
  root = "./",
  files = []
) => {
  fs.readdirSync(directory).forEach((file) => {
    const abs_path = path.join(directory, file);
    const rel_path = path.join(root, file);

    if (fs.statSync(abs_path).isDirectory()) {
      read_directory_structure_recursive(abs_path, rel_path, files);
    } else {
      files.push(rel_path);
    }
  });

  return files;
};

const compute_cross_dependencies = (template_package, local_package) =>
  Object.keys(template_package.devDependencies).reduce((acc, v) => {
    if ((local_package.devDependencies || {}).hasOwnProperty(v)) {
      acc.push(v);
    }
    return acc;
  }, []);

const extract_directories_structure = (template) => {
  const local_infrastructure = fs.existsSync("./infrastructure")
    ? read_directory_structure_recursive("./infrastructure")
    : [];

  const base_template_infrastructure = read_directory_structure_recursive(
    path.join(__dirname, "./templates/infrastructure")
  );

  const template_infrastructure =
    template === "empty"
      ? []
      : read_directory_structure_recursive(
          path.join(__dirname, "./templates", template)
        );

  const final_template_infrastructure = [
    ...base_template_infrastructure,
    ...template_infrastructure,
  ].filter((value, index, self) => self.indexOf(value) === index);

  const intersectioned_infrastructure = final_template_infrastructure.reduce(
    (acc, v) => {
      if (local_infrastructure.includes(v)) acc.push(v);
      return acc;
    },
    []
  );

  return {
    local_infrastructure,
    base_template_infrastructure,
    template_infrastructure,
    final_template_infrastructure,
    intersectioned_infrastructure,
  };
};

const extract_npm_packages = () => {
  const local_package = JSON.parse(
    fs.readFileSync("./package.json").toString()
  );
  const template_package = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./templates/package.json")).toString()
  );

  return { local_package, template_package };
};

const read_local_cdk_json = () => {
  return fs.existsSync("./cdk.json")
    ? JSON.parse(fs.readFileSync("./cdk.json").toString())
    : {};
};

const try_extract_bitbucket_workspace = (obj) => {
  const frags = (lodash.get(obj, "context.tags.repository") || "").split("/");
  if (frags.length > 1) return frags[0];
};

const try_extract_repo_name = (obj, defaultName) => {
  const repoName = lodash.get(obj, "context.tags.repository");
  if (!repoName) return defaultName;

  const frags = repoName.split("/");
  return frags.length > 1 ? frags[1] : frags[0];
};

(async () => {
  if (!fs.existsSync("./package.json")) {
    console.error("package.json not found, initializing...");
    process.exit(1);
  }

  const software_version = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./package.json")).toString()
  ).version;
  const { local_package, template_package } = extract_npm_packages();
  const local_cdk_json = read_local_cdk_json();

  const options = await prompts(
    [
      {
        type: compute_cross_dependencies(template_package, local_package).length
          ? "multiselect"
          : null,
        name: "override_packages",
        message:
          "Some dev dependencies already exists, select which one to overwrite",
        choices: compute_cross_dependencies(
          template_package,
          local_package
        ).map(toMultiChoice),
      },
      {
        type: "select",
        name: "repositoryType",
        message: "Select a repository type",
        choices: [
          {
            title: "Bitbucket",
            description: "The repository lives in Bitbucket",
            value: "bitbucket",
          },
          {
            title: "CodeCommit",
            description: "The repository lives in AWS code commit",
            value: "codecommit",
          },
        ],
        initial: 0,
      },
      {
        type: (_, values) =>
          values.repositoryType === "bitbucket" ? "text" : null,
        name: "bitbucket_workspace",
        message: `Insert bitbucket workspace`,
        initial: try_extract_bitbucket_workspace(local_cdk_json),
        validate: required,
      },
      {
        type: "text",
        name: "ci_account",
        message: `Insert the ci account number`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.ci.account"),
      },
      {
        type: "text",
        name: "staging_account",
        message: `Insert the staging account number`,
        initial: lodash.get(local_cdk_json, "context.stag.account"),
        validate: required,
      },
      {
        type: "text",
        name: "production_account",
        message: `Insert the production account number`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.prod.account"),
      },
      {
        type: "text",
        name: "product",
        message: `Insert the product name`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.tags.product"),
      },
      {
        type: "text",
        name: "service",
        message: `Insert the service name`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.tags.service"),
      },
      {
        type: "text",
        name: "team",
        message: `Insert the team name`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.tags.team"),
      },
      {
        type: "text",
        name: "repository",
        message: `Insert the repository name`,
        initial: local_package.name,
        validate: required,
        initial: try_extract_repo_name(local_cdk_json, local_package.name),
      },
      {
        type: "text",
        name: "branch",
        initial: "master",
        message: `Insert the release branch`,
        validate: required,
        initial: lodash.get(local_cdk_json, "context.branch") || "main",
      },
      {
        type: "select",
        name: "template",
        message: "Select the required template",
        choices: available_templates.map(toMultiChoice),
      },
      {
        type: (_, values) => {
          const { intersectioned_infrastructure } =
            extract_directories_structure(values.template);
          return intersectioned_infrastructure.length ? "multiselect" : null;
        },
        name: "override_infra",
        message: `The infrastructure folder already exists, select what files to overwrite`,
        choices: (_, values) => {
          const { intersectioned_infrastructure } =
            extract_directories_structure(values.template);

          return intersectioned_infrastructure.map(toMultiChoice);
        },
      },
    ],
    {
      onCancel: () => {
        process.exit(1);
      },
    }
  );

  if (options.bitbucket_workspace)
    options.repository = `${options.bitbucket_workspace}/${options.repository}`;

  const { base_template_infrastructure, template_infrastructure } =
    extract_directories_structure(options.template);

  sync_packages(local_package, template_package, software_version, options);
  sync_infrastructure(
    base_template_infrastructure,
    template_infrastructure,
    options
  );
  sync_cdk_json(local_cdk_json, options);
  sync_others();

  console.log("now run [npm|yarn] i");
})();
