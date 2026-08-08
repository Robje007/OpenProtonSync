{
  description = "Sync local directories to Proton Drive cloud storage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      # Version and platform-specific hashes for pre-built binaries.
      # These are updated automatically by CI on each stable release.
      version = "1.0.1";
      hashes = {
        x86_64-linux = "sha256-vV01c0WZeIjKyG1ER0bp56Pl5l1puPFZl1SMNli32T0=";
        aarch64-linux = "sha256-NKi4GutP6w/kr4LpTfM3GR3afSGjERM7jGJvAN2Z0AY=";
        aarch64-darwin = "sha256-4ZfZcSCbsZTfnFFryZZGRS1qfZnqd+s3JGeQ7I9ROwk=";
        x86_64-darwin = "sha256-pnF7avIDzyaya0QSAXYAQw8reQVlV4E81n4pwwJJN2A=";
      };

      # Map Nix system strings to GitHub release artifact suffixes.
      targetMap = {
        x86_64-linux = "linux-x64";
        aarch64-linux = "linux-arm64";
        aarch64-darwin = "darwin-arm64";
        x86_64-darwin = "darwin-x64";
      };

      supportedSystems = builtins.attrNames targetMap;

      mkPackage =
        pkgs: system:
        let
          target = targetMap.${system};
          isLinux = pkgs.lib.hasSuffix "linux" system;
        in
        pkgs.stdenv.mkDerivation {
          pname = "openprotonsync";
          inherit version;

          src = pkgs.fetchurl {
            url = "https://github.com/Robje007/OpenProtonSync/releases/download/v${version}/openprotonsync-${target}.tar.gz";
            hash = hashes.${system};
          };

          # The tarball contains just the binary at the top level.
          sourceRoot = ".";

          nativeBuildInputs = pkgs.lib.optionals isLinux [
            pkgs.autoPatchelfHook
          ];

          buildInputs = pkgs.lib.optionals isLinux [
            pkgs.stdenv.cc.cc.lib # libstdc++
            pkgs.libsecret # keytar native module
          ];

          # autoPatchelfHook: add libsecret to RPATH at runtime.
          runtimeDependencies = pkgs.lib.optionals isLinux [
            pkgs.libsecret
          ];

          dontConfigure = true;
          dontBuild = true;

          unpackPhase = ''
            tar xzf $src
          '';

          installPhase = ''
            runHook preInstall
            install -Dm755 openprotonsync $out/bin/openprotonsync
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Sync local directories to Proton Drive cloud storage";
            homepage = "https://github.com/Robje007/OpenProtonSync";
            license = licenses.gpl3Only;
            maintainers = [ ];
            platforms = supportedSystems;
            mainProgram = "openprotonsync";
          };
        };
    in
    flake-utils.lib.eachSystem supportedSystems (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          openprotonsync = mkPackage pkgs system;
          default = self.packages.${system}.openprotonsync;
        };

        devShells.default = pkgs.mkShell {
          buildInputs =
            [
              pkgs.bun
              pkgs.nodejs
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
              pkgs.libsecret
              pkgs.pkg-config
            ];

          shellHook = ''
            echo "openprotonsync dev shell"
            echo "  bun: $(bun --version)"
            echo "  node: $(node --version)"
          '';
        };
      }
    )
    // {
      overlays.default = final: _prev: {
        openprotonsync = mkPackage final final.stdenv.hostPlatform.system;
      };
    };
}
