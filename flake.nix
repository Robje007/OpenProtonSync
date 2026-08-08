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
      version = "1.0.0";
      hashes = {
        x86_64-linux = "sha256-NVYNVeb9O9YnDpySlAE3HsxhecT92Xib2TfaPHNrgBI=";
        aarch64-linux = "sha256-OSmTljho/uFsxXNinzdjeFmVJCez7Wn+MXfVsg7zk2M=";
        aarch64-darwin = "sha256-Z4GZIV7cy8ggWTxUrozOqC7ZZQ6Hm8Eri6HMJNnmm0c=";
        x86_64-darwin = "sha256-GoFbHV3ebuopC7HqsxEvdLfQnRXmQ8zjo5gQgEv0uBY=";
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
          pname = "proton-drive-sync";
          inherit version;

          src = pkgs.fetchurl {
            url = "https://github.com/Robje007/proton-drive-sync/releases/download/v${version}/proton-drive-sync-${target}.tar.gz";
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
            install -Dm755 proton-drive-sync $out/bin/proton-drive-sync
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Sync local directories to Proton Drive cloud storage";
            homepage = "https://github.com/Robje007/proton-drive-sync";
            license = licenses.gpl3Only;
            maintainers = [ ];
            platforms = supportedSystems;
            mainProgram = "proton-drive-sync";
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
          proton-drive-sync = mkPackage pkgs system;
          default = self.packages.${system}.proton-drive-sync;
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
            echo "proton-drive-sync dev shell"
            echo "  bun: $(bun --version)"
            echo "  node: $(node --version)"
          '';
        };
      }
    )
    // {
      overlays.default = final: _prev: {
        proton-drive-sync = mkPackage final final.stdenv.hostPlatform.system;
      };
    };
}
