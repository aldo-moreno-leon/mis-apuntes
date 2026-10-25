"""Servidor local de "Mis apuntes" (modo edición).

Sirve el sitio y permite crear, editar, renombrar y eliminar temas y apuntes
desde el navegador. Cada apunte es un archivo Markdown en  apuntes/<Tema>/<Apunte>.md
y después de cada cambio se actualiza  apuntes/indice.json.

En GitHub Pages el sitio funciona en modo lectura; para editar, ejecuta esto en tu
computadora y luego sube los cambios con git.

Uso:  py servidor.py [--puerto 8765] [--sin-navegador]
Solo usa la biblioteca estándar de Python (3.8+).
"""

import argparse
import json
import re
import shutil
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from generar_indice import CARPETA_APUNTES, generar_indice

RAIZ = CARPETA_APUNTES.parent
PAPELERA = ".papelera"
CARACTERES_INVALIDOS = re.compile(r'[<>:"/\\|?*#%\x00-\x1f]')


def limpiar_nombre(nombre):
    """Convierte un nombre escrito por el usuario en un nombre de archivo válido."""
    nombre = CARACTERES_INVALIDOS.sub("", nombre or "").strip().strip(".").strip()
    if not nombre:
        raise ValueError("El nombre está vacío o no es válido.")
    return nombre[:100]


def ruta_segura(*partes):
    """Une partes de ruta dentro de apuntes/ e impide salir de esa carpeta."""
    ruta = CARPETA_APUNTES.joinpath(*partes).resolve()
    if CARPETA_APUNTES not in ruta.parents:
        raise ValueError("Ruta no permitida.")
    return ruta


def ruta_tema(tema):
    return ruta_segura(limpiar_nombre(tema))


def ruta_apunte(tema, apunte):
    return ruta_segura(limpiar_nombre(tema), limpiar_nombre(apunte) + ".md")


def mismo_archivo(a, b):
    # Permite cambiar solo mayúsculas/minúsculas en Windows (mismo archivo).
    return a.name.lower() == b.name.lower()


def escribir(ruta, contenido):
    ruta.write_text(contenido or "", encoding="utf-8", newline="\n")


def crear_tema(nombre):
    ruta = ruta_tema(nombre)
    if ruta.exists():
        raise FileExistsError("Ya existe un tema con ese nombre.")
    ruta.mkdir(parents=True)
    return {"tema": ruta.name}


def renombrar_tema(tema, nuevo_nombre):
    ruta = ruta_tema(tema)
    if not ruta.is_dir():
        raise FileNotFoundError("El tema no existe.")
    destino = ruta_tema(nuevo_nombre)
    if destino.exists() and not mismo_archivo(ruta, destino):
        raise FileExistsError("Ya existe un tema con ese nombre.")
    return {"tema": ruta.rename(destino).name}


def crear_apunte(tema, apunte, contenido):
    ruta = ruta_apunte(tema, apunte)
    if not ruta.parent.is_dir():
        raise FileNotFoundError("El tema no existe.")
    if ruta.exists():
        raise FileExistsError("Ya existe un apunte con ese nombre en este tema.")
    escribir(ruta, contenido)
    return {"tema": ruta.parent.name, "apunte": ruta.stem}


def guardar_apunte(tema, apunte, contenido, nuevo_nombre=None):
    ruta = ruta_apunte(tema, apunte)
    if not ruta.is_file():
        raise FileNotFoundError("El apunte no existe.")
    if nuevo_nombre and limpiar_nombre(nuevo_nombre) != ruta.stem:
        destino = ruta_apunte(tema, nuevo_nombre)
        if destino.exists() and not mismo_archivo(ruta, destino):
            raise FileExistsError("Ya existe un apunte con ese nombre en este tema.")
        ruta = ruta.rename(destino)
    escribir(ruta, contenido)
    return {"tema": ruta.parent.name, "apunte": ruta.stem}


def mover_a_papelera(ruta):
    """En lugar de borrar, mueve a apuntes/.papelera/ para poder recuperarlo."""
    papelera = CARPETA_APUNTES / PAPELERA
    papelera.mkdir(exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.move(str(ruta), str(papelera / f"{marca} {ruta.parent.name} - {ruta.name}"))
    return {"ok": True}


def borrar_tema(tema):
    ruta = ruta_tema(tema)
    if not ruta.is_dir():
        raise FileNotFoundError("El tema no existe.")
    return mover_a_papelera(ruta)


def borrar_apunte(tema, apunte):
    ruta = ruta_apunte(tema, apunte)
    if not ruta.is_file():
        raise FileNotFoundError("El apunte no existe.")
    return mover_a_papelera(ruta)


class Manejador(SimpleHTTPRequestHandler):
    hosts_permitidos = set()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def log_message(self, formato, *args):
        pass  # Mantiene la consola limpia.

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            return self.api("GET", url)
        return super().do_GET()

    def do_POST(self):
        self.api("POST", urlparse(self.path))

    def do_PUT(self):
        self.api("PUT", urlparse(self.path))

    def do_DELETE(self):
        self.api("DELETE", urlparse(self.path))

    def peticion_confiable(self, metodo):
        # Evita que otras páginas abiertas en el navegador modifiquen tus apuntes.
        if self.headers.get("Host", "") not in self.hosts_permitidos:
            return False
        return metodo == "GET" or self.headers.get("X-Apuntes") == "1"

    def leer_json(self):
        largo = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(largo).decode("utf-8")) if largo else {}

    def responder(self, estado, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def api(self, metodo, url):
        if not self.peticion_confiable(metodo):
            return self.responder(403, {"error": "Petición no permitida."})
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        rutas = {
            ("GET", "/api/estado"): lambda d: {"editable": True},
            ("POST", "/api/tema"): lambda d: crear_tema(d.get("nombre")),
            ("PUT", "/api/tema"): lambda d: renombrar_tema(d.get("tema"), d.get("nuevoNombre")),
            ("DELETE", "/api/tema"): lambda d: borrar_tema(q.get("tema")),
            ("POST", "/api/apunte"): lambda d: crear_apunte(d.get("tema"), d.get("apunte"), d.get("contenido")),
            ("PUT", "/api/apunte"): lambda d: guardar_apunte(
                d.get("tema"), d.get("apunte"), d.get("contenido"), d.get("nuevoNombre")),
            ("DELETE", "/api/apunte"): lambda d: borrar_apunte(q.get("tema"), q.get("apunte")),
        }
        accion = rutas.get((metodo, url.path))
        if not accion:
            return self.responder(404, {"error": "Ruta no encontrada."})
        try:
            datos = self.leer_json() if metodo in ("POST", "PUT") else {}
            resultado = accion(datos)
            if metodo != "GET":
                generar_indice()
            self.responder(200, resultado)
        except FileNotFoundError as e:
            self.responder(404, {"error": str(e)})
        except FileExistsError as e:
            self.responder(409, {"error": str(e)})
        except ValueError as e:  # Incluye JSON inválido.
            self.responder(400, {"error": str(e)})
        except OSError as e:
            self.responder(500, {"error": f"Error de archivo: {e}"})


def main():
    parser = argparse.ArgumentParser(description="Servidor local de Mis apuntes")
    parser.add_argument("--puerto", type=int, default=8765)
    parser.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    args = parser.parse_args()

    generar_indice()
    Manejador.hosts_permitidos = {f"{h}:{args.puerto}" for h in ("127.0.0.1", "localhost")}
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", args.puerto), Manejador)
    except OSError:
        sys.exit(f"El puerto {args.puerto} está ocupado. ¿Ya está abierta la app? "
                 f"Prueba con: py servidor.py --puerto 8766")

    direccion = f"http://localhost:{args.puerto}"
    print(f"Mis apuntes (modo edición) en {direccion}")
    print(f"Apuntes guardados en: {CARPETA_APUNTES}")
    print("Cierra esta ventana o presiona Ctrl+C para detenerlo.")
    if not args.sin_navegador:
        threading.Timer(0.5, webbrowser.open, [direccion]).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
