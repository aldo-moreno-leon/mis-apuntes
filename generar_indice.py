"""Genera apuntes/indice.json: la lista de temas y apuntes que lee el sitio.

El servidor local lo actualiza solo al guardar. Si agregas archivos .md a mano,
ejecuta:  py generar_indice.py
"""

import json
from pathlib import Path

CARPETA_APUNTES = (Path(__file__).resolve().parent / "apuntes").resolve()
ARCHIVO_INDICE = CARPETA_APUNTES / "indice.json"


def ordenar(rutas):
    return sorted(rutas, key=lambda r: r.name.lower())


def listar_temas():
    temas = []
    for carpeta in ordenar(CARPETA_APUNTES.iterdir()):
        if not carpeta.is_dir() or carpeta.name.startswith("."):
            continue
        apuntes = [a.stem for a in ordenar(carpeta.glob("*.md"))]
        temas.append({"nombre": carpeta.name, "apuntes": apuntes})
    return temas


def generar_indice():
    CARPETA_APUNTES.mkdir(exist_ok=True)
    temas = listar_temas()
    nuevo = json.dumps({"temas": temas}, ensure_ascii=False, indent=2) + "\n"
    actual = ARCHIVO_INDICE.read_text(encoding="utf-8") if ARCHIVO_INDICE.exists() else None
    if nuevo != actual:
        ARCHIVO_INDICE.write_text(nuevo, encoding="utf-8", newline="\n")
    return temas


if __name__ == "__main__":
    temas = generar_indice()
    total = sum(len(t["apuntes"]) for t in temas)
    print(f"Índice actualizado: {len(temas)} temas, {total} apuntes.")
