#!/usr/bin/env bash
#
# convertir-a-webp.sh
# -------------------------------------------------------------------
# Convierte a WebP todas las imágenes (jpg, jpeg, png, tif, tiff, bmp)
# que encuentre en la carpeta indicada Y EN TODAS SUS SUBCARPETAS.
#
#  - La resolución en píxeles se mantiene intacta (no se redimensiona).
#  - Calidad q=90 (alta, casi indistinguible del original).
#  - Los archivos originales NO se tocan: el .webp se crea al lado.
#  - Si el .webp ya existe y es más reciente que el original, se omite
#    (puedes volver a ejecutar el script sin reconvertir todo).
#
# USO:
#    ./convertir-a-webp.sh [carpeta]
#
#    Si no indicas carpeta, usa la carpeta actual (.).
#    Ejemplos:
#        ./convertir-a-webp.sh
#        ./convertir-a-webp.sh resources/images
#
# REQUISITOS (uno de los dos):
#    - cwebp   (paquete "webp" de Google) — recomendado.
#         macOS:   brew install webp
#         Debian/Ubuntu:  sudo apt install webp
#    - O bien ImageMagick (comando "magick" o "convert").
#         macOS:   brew install imagemagick
#         Debian/Ubuntu:  sudo apt install imagemagick
# -------------------------------------------------------------------

set -euo pipefail

CALIDAD=90
CARPETA="${1:-.}"

if [ ! -d "$CARPETA" ]; then
  echo "ERROR: la carpeta '$CARPETA' no existe." >&2
  exit 1
fi

# --- Detectar la herramienta de conversión disponible --------------------
CONVERSOR=""
if command -v cwebp >/dev/null 2>&1; then
  CONVERSOR="cwebp"
elif command -v magick >/dev/null 2>&1; then
  CONVERSOR="magick"
elif command -v convert >/dev/null 2>&1; then
  CONVERSOR="convert"
else
  echo "ERROR: no se encontró ni 'cwebp' ni ImageMagick." >&2
  echo "Instala uno de los dos (ver cabecera de este script)." >&2
  exit 1
fi
echo "Usando conversor: $CONVERSOR  ·  calidad q=$CALIDAD"
echo "Carpeta de trabajo: $CARPETA"
echo

# --- Función que convierte un único archivo ------------------------------
convertir_uno() {
  origen="$1"
  destino="${origen%.*}.webp"

  # Omitir si el .webp ya existe y es igual o más reciente que el original.
  if [ -f "$destino" ] && [ "$destino" -nt "$origen" ]; then
    echo "  (omitido, ya existe) $destino"
    return 0
  fi

  case "$CONVERSOR" in
    cwebp)
      # -q 90: calidad. -mt: multihilo. -quiet: sin verborrea.
      cwebp -q "$CALIDAD" -mt -quiet "$origen" -o "$destino"
      ;;
    magick)
      magick "$origen" -quality "$CALIDAD" "$destino"
      ;;
    convert)
      convert "$origen" -quality "$CALIDAD" "$destino"
      ;;
  esac
  echo "  convertido -> $destino"
}

# --- Recorrer recursivamente todas las imágenes --------------------------
# -print0 / read -d '' para soportar nombres con espacios o acentos.
total=0
find "$CARPETA" -type f \
  \( -iname '*.jpg'  -o -iname '*.jpeg' -o -iname '*.png' \
     -o -iname '*.tif' -o -iname '*.tiff' -o -iname '*.bmp' \) \
  -print0 | while IFS= read -r -d '' archivo; do
    echo "[$archivo]"
    convertir_uno "$archivo"
    total=$((total + 1))
done

echo
echo "Listo. Revisa los archivos .webp generados junto a cada original."
