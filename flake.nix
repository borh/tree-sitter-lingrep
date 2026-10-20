{
  description = "tree-sitter-lingrep: Grammar for lingrep patterns";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    flake-parts.url = "github:hercules-ci/flake-parts";

    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.git-hooks-nix.flakeModule
      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      perSystem =
        {
          config,
          self',
          pkgs,
          ...
        }:
        let
          development-packages = [
            pkgs.bashInteractive
            pkgs.nodejs
            pkgs.git
            pkgs.gnumake
            pkgs.tree-sitter
          ];
        in
        {
          formatter = pkgs.nixfmt;
          pre-commit.settings.hooks = {
            nixfmt-rfc-style.enable = true;
            flake-checker.enable = true;
            grammar-abi = {
              enable = true;
              name = "grammar ABI";
              entry = "${pkgs.gnugrep}/bin/grep -q '#define LANGUAGE_VERSION 15' src/parser.c";
              files = "^src/parser\\.c$";
              pass_filenames = false;
            };
          };

          devShells = {
            default = pkgs.mkShell {
              nativeBuildInputs = development-packages;
              shellHook = ''
                ${config.pre-commit.installationScript}
                # Resetting tty settings prevents issues after exiting the shell
                ${pkgs.coreutils}/bin/stty sane
                # Set up shell and prompt
                export SHELL=${pkgs.bashInteractive}/bin/bash
                export PS1='(direnv) \[\e[34m\]\w\[\e[0m\] $(if [[ $? == 0 ]]; then echo -e "\[\e[32m\]"; else echo -e "\[\e[31m\]"; fi)#\[\e[0m\] '
                eval "$(direnv hook bash)"
                export PATH=${self'.packages.build-ts}/bin/:$PATH
              '';
            };
          };

          packages.build-ts = pkgs.writeShellApplication {
            name = "build-ts";
            runtimeInputs = development-packages;
            text = ''
              make clean
              tree-sitter generate --abi=15 --report-states-for-rule '-' grammar.js
              tree-sitter generate --abi=15 grammar.js
              make test
              tree-sitter build --wasm
              tree-sitter playground -q
            '';
          };
          packages.tree-sitter-lingrep = pkgs.tree-sitter.buildGrammar {
            language = "lingrep";
            version = "0.1.0";
            src = ./.;
          };
        };
    };
}
