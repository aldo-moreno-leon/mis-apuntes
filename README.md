# 📒 Mis apuntes

Espacio personal para guardar notas sobre herramientas, tutoriales, comandos y pasos para hacer cosas.
Tiene un menú lateral con los temas, buscador, resaltado de código con botón **Copiar** y modo claro/oscuro.

- **En GitHub Pages**: modo lectura.
- **En tu computadora** (`iniciar.bat`): modo edición para crear, editar, renombrar y eliminar temas y apuntes.

## Estructura

```text
apuntes/
  <Tema>/<Apunte>.md   ← tus apuntes en Markdown
  indice.json          ← lista de temas (se genera sola)
index.html, app.js, estilos.css  ← el sitio
servidor.py            ← servidor local para editar (solo Python, sin instalar nada)
generar_indice.py      ← regenera apuntes/indice.json
```

## Editar en local

Requiere Python 3.8 o superior. Doble clic en `iniciar.bat`, o:

```bash
py servidor.py
```

Se abre `http://localhost:8765`. Usa **+ Nuevo tema** en el menú lateral o el **+** junto a cada tema.
Los cambios se guardan como archivos `.md` en `apuntes/`. Lo que elimines va a `apuntes/.papelera/` (no se sube a GitHub).

Después sube los cambios:

```bash
git add -A
git commit -m "Nuevos apuntes"
git push
```

Si creas o renombras archivos `.md` a mano (sin el servidor), actualiza el índice antes de subir:

```bash
py generar_indice.py
```

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`**.
3. Cada `git push` a `main` publica el sitio en `https://<usuario>.github.io/<repositorio>/`.

> ⚠️ En el plan gratuito de GitHub, Pages requiere un repositorio público: no guardes contraseñas, tokens ni datos privados.
