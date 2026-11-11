#!/bin/sh
# AC1 de #370: pico de RSS por objeto y camino, cada uno en un proceso nuevo con
# la caché vacía (PS1_HARNESS_DIR propio), bajo /usr/bin/time -l (macOS).
# Swap antes y después: el listón de AC6 mira si la corrida la hace crecer.
#   sh scripts/harness_ps1_nativo_370_ram.sh [DIR_TEMPORAL]
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
TMP=${1:-$(mktemp -d)}
OBJETOS="NGC 205|NGC 5194|NGC 5457|NGC 3031|NGC 4565|NGC 891|NGC 253|NGC7293|IC2177"
echo "swap antes: $(sysctl -n vm.swapusage)"
echo "$OBJETOS" | tr '|' '\n' | while read -r O; do
  for C in fitscut nativo; do
    D="$TMP/ram_$(echo "$O" | tr -d ' ')_$C"
    rm -rf "$D"; mkdir -p "$D"
    R=$(PS1_HARNESS_DIR="$D" /usr/bin/time -l node "$DIR/harness_ps1_nativo_370.js" --ram "$O" --camino "$C" 2>"$D/time.txt")
    PICO=$(awk '/maximum resident set size/{print $1}' "$D/time.txt")
    echo "$O · $C · pico RSS $(echo "$PICO" | awk '{printf "%.0f MB", $1/1048576}') · $R"
    rm -rf "$D"
  done
done
echo "swap después: $(sysctl -n vm.swapusage)"
