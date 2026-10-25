{
  description = "Attraccess shared Attractap hardware lab";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forSystems = nixpkgs.lib.genAttrs systems;
    in {
      nixosModules.attractap-lab = import ./nix/module.nix;
      packages = forSystems (system:
        let pkgs = import nixpkgs { inherit system; }; in rec {
          attractap-lab = pkgs.callPackage ./nix/package.nix { };
          default = attractap-lab;
        });
      checks = forSystems (system:
        let pkgs = import nixpkgs { inherit system; }; in {
          attractap-lab = self.packages.${system}.attractap-lab;
          lab-smoke = pkgs.testers.runNixOSTest (import ./nix/tests/lab.nix {
            inherit self;
          });
        });
    };
}
