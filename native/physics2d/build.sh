#!/usr/bin/env bash
# Builds the 2D physics: Box2D v3.1.1 and the engine's flat layer over it (naca_physics2d.c), compiled to
# WebAssembly with zig, and written into src/physics/box2d/box2d_wasm.ts as base64.
#
# Needs git and zig (brew install zig). Only to change the physics: the result is in the repository, so
# building the engine, its tests and CI need neither.
set -euo pipefail
cd "$(dirname "$0")"
TAG=v3.1.1
if [[ ! -d box2d ]]; then
    git clone --quiet --depth 1 --branch "$TAG" https://github.com/erincatto/box2d.git box2d
fi
mkdir -p out
# -ffp-contract=off: no fused multiply-add, so the same steps give the same numbers on every machine.
zig cc -target wasm32-wasi -O3 -std=c17 -ffp-contract=off -DNDEBUG -Ibox2d/include -Ibox2d/src \
    -mexec-model=reactor -fvisibility=hidden -Wl,--export-dynamic -Wl,--strip-all \
    box2d/src/*.c naca_physics2d.c -o out/physics2d.wasm
bun embed_wasm.ts out/physics2d.wasm ../../src/physics/box2d/box2d_wasm.ts
