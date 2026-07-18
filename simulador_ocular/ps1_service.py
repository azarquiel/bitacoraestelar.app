"""Servicio de recortes Pan-STARRS1 para el simulador de oculares.

La entrada científica es un FITS monocromático (banda i) y su máscara de
calidad, no el JPEG coloreado de un HiPS. Los píxeles inválidos se sustituyen
solo para la visualización; el encabezado ``X-PS1-Repaired-Pixels`` deja claro
cuántos se han corregido.

Ejecutar en desarrollo:
    uvicorn ps1_service:app --reload --port 8000
"""

from __future__ import annotations

import csv
import hashlib
import io
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import requests
from astropy.io import fits
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from scipy import ndimage


PS1_LIST_URL = "https://ps1images.stsci.edu/cgi-bin/ps1filenames.py"
PS1_CUTOUT_URL = "https://ps1images.stsci.edu/cgi-bin/fitscut.cgi"
PIXELS_PER_ARCMIN = 240  # PS1: 0,25 arcsec/píxel
MAX_FOV_ARCMIN = 25.0   # límite de 6000 píxeles del servicio PS1
OUTPUT_SIZE = 720
REQUEST_TIMEOUT_SECONDS = 120
REPAIR_RADIUS_PIXELS = 12
MIN_VALID_FRACTION = 0.80
# No todos los bits de stack.mask invalidan el dato. Por ejemplo, SAT y
# STARCORE describen una estrella brillante; nunca deben sustituirse solo por
# estar marcadas. La máscara se combina con una prueba de oscuridad local.
PS1_ARTIFACT_FLAGS = 0x0008 | 0x0020 | 0x2000
PIPELINE_VERSION = "2"
CACHE_DIR = Path(os.environ.get("PS1_CACHE_DIR", "cache-ps1"))

session = requests.Session()
session.headers.update({"User-Agent": "simulador-oculares/1.0 (PS1 FITS viewer)"})

app = FastAPI(title="Simulador de oculares · PS1 FITS")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restringir al dominio final al desplegar.
    allow_methods=["GET"],
    allow_headers=["*"],
)


class InsufficientCoverageError(ValueError):
    """El skycell elegido contiene demasiados píxeles sin datos."""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ps1/cutout.png")
def ps1_cutout(
    ra: float = Query(..., ge=0, lt=360, description="Ascensión recta J2000, grados"),
    dec: float = Query(..., ge=-30, le=90, description="Declinación J2000, grados"),
    fov_arcmin: float = Query(..., gt=0, le=MAX_FOV_ARCMIN),
    size: int = Query(OUTPUT_SIZE, ge=128, le=OUTPUT_SIZE),
) -> Response:
    """Devuelve una vista gris PNG libre de huecos de máscara para un campo PS1.

    PS1 cubre aproximadamente declinaciones mayores que -30°. Los campos más
    grandes de 25' necesitan un mosaico; el cliente conserva HiPS/DSS como
    reserva mientras se implementa esa segunda fase.
    """
    key = _cache_key(ra, dec, fov_arcmin, size)
    cached = CACHE_DIR / f"{key}.png"
    metadata = CACHE_DIR / f"{key}.txt"
    if cached.exists() and metadata.exists():
        repaired = metadata.read_text(encoding="utf-8").strip()
        return Response(
            cached.read_bytes(),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400", "X-PS1-Repaired-Pixels": repaired},
        )

    try:
        image_name, mask_name = _image_filenames(ra, dec)
        pixels = max(1, min(6000, round(fov_arcmin * PIXELS_PER_ARCMIN)))
        image_data = _download_fits_cutout(ra, dec, pixels, image_name)
        mask_data = _download_fits_cutout(ra, dec, pixels, mask_name) if mask_name else None
        rendered, repaired = _render_for_display(image_data, mask_data, size)
    except InsufficientCoverageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Pan-STARRS no respondió") from exc
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=502, detail="Recorte PS1 inválido o incompleto") from exc

    png = _as_png(rendered)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(png)
    metadata.write_text(str(repaired), encoding="utf-8")
    return Response(
        png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400", "X-PS1-Repaired-Pixels": str(repaired)},
    )


def _cache_key(ra: float, dec: float, fov_arcmin: float, size: int) -> str:
    value = f"{PIPELINE_VERSION}|{ra:.5f}|{dec:.5f}|{fov_arcmin:.3f}|{size}"
    return hashlib.sha256(value.encode("ascii")).hexdigest()


@lru_cache(maxsize=512)
def _image_filenames(ra: float, dec: float) -> tuple[str, str | None]:
    """Obtiene las rutas de la imagen i y de su máscara stack.mask."""
    response = session.get(
        PS1_LIST_URL,
        params={"ra": ra, "dec": dec, "filters": "i", "type": "stack,stack.mask", "sep": ","},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    rows = list(csv.DictReader(line for line in response.text.splitlines() if line.strip()))
    image_name = next((row["filename"] for row in rows if row.get("type") == "stack"), None)
    mask_name = next((row["filename"] for row in rows if row.get("type") == "stack.mask"), None)
    if not image_name:
        raise ValueError("No hay cobertura PS1 para estas coordenadas")
    return image_name, mask_name


def _download_fits_cutout(ra: float, dec: float, pixels: int, filename: str | None) -> np.ndarray:
    if not filename:
        raise ValueError("No hay máscara PS1")
    response = session.get(
        PS1_CUTOUT_URL,
        params={"ra": ra, "dec": dec, "size": pixels, "format": "fits", "red": filename},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    with fits.open(io.BytesIO(response.content), memmap=False) as hdul:
        data = hdul[0].data
        if data is None:
            raise ValueError("FITS sin datos")
        # Los FITS-cutout de PS1 ya son flotantes. float32 reduce a la mitad el
        # pico de memoria de un campo amplio antes de redimensionarlo a 720 px.
        return np.asarray(data, dtype=np.float32)


def _render_for_display(data: np.ndarray, quality_mask: np.ndarray | None, size: int) -> tuple[np.ndarray, int]:
    """Repara huecos pequeños y aplica un estirado asinh solo para pantalla."""
    if data.ndim != 2:
        raise ValueError("El FITS no es una imagen bidimensional")
    invalid = ~np.isfinite(data)
    if np.mean(~invalid) < MIN_VALID_FRACTION:
        raise InsufficientCoverageError(
            "El recorte PS1 solo tiene cobertura parcial; prueba DSS o un campo distinto"
        )
    if quality_mask is not None and quality_mask.shape == data.shape:
        flags = np.nan_to_num(quality_mask, nan=0).astype(np.uint16)
        flagged = (flags & PS1_ARTIFACT_FLAGS) != 0
        # Un flag no basta para borrar una estrella: se repara únicamente un
        # valor oscuro que contradice su halo inmediato (la rosquilla negra).
        safe_data = np.where(np.isfinite(data), data, np.nanmedian(data))
        local = ndimage.median_filter(safe_data, size=7, mode="nearest")
        dark_hole = np.isfinite(data) & (data < local * 0.35)
        invalid |= flagged & dark_hole
    valid = ~invalid
    if not np.any(valid):
        raise ValueError("Todos los píxeles están enmascarados")

    # Solo se sustituyen defectos pequeños: no inventamos regiones astronómicas
    # extensas. Gaia/Photutils se incorporarán después para reconstruir PSF.
    distance, indices = ndimage.distance_transform_edt(invalid, return_indices=True)
    repairable = invalid & (distance <= REPAIR_RADIUS_PIXELS)
    repaired = data.copy()
    repaired[repairable] = data[tuple(indices[:, repairable])]
    repaired[invalid & ~repairable] = np.nanmedian(data[valid])

    finite = repaired[np.isfinite(repaired)]
    black, white = np.percentile(finite, (1, 99.8))
    scale = max(white - black, np.finfo(float).eps)
    normalized = np.clip((repaired - black) / scale, 0, None)
    stretched = np.arcsinh(12 * normalized) / np.arcsinh(12)
    image = Image.fromarray(np.uint8(np.clip(stretched * 255, 0, 255)), mode="L")
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    return np.asarray(image), int(np.count_nonzero(repairable))


def _as_png(array: np.ndarray) -> bytes:
    output = io.BytesIO()
    Image.fromarray(array, mode="L").save(output, format="PNG", optimize=True)
    return output.getvalue()
