# Cómo usar estos apuntes

Cada **tema** es una carpeta dentro de `apuntes/` y cada **apunte** es un archivo `.md` (Markdown) dentro de esa carpeta.

```text
apuntes/
├── Git/
│   └── Comandos básicos.md
└── Docker/
    └── Contenedores.md
```

## Agregar un tema o apunte (recomendado)

1. Abre `iniciar.bat` (doble clic) o ejecuta:

   ```bash
   py servidor.py
   ```

2. En el navegador usa **+ Nuevo tema** (menú lateral) o el **+** que aparece junto a cada tema.
3. Escribe el apunte y presiona **Guardar** (o `Ctrl+S`).
4. Sube los cambios a GitHub:

   ```bash
   git add -A
   git commit -m "Nuevos apuntes"
   git push
   ```

## Agregar un apunte a mano

Crea el archivo `apuntes/<Tema>/<Nombre>.md` con cualquier editor y luego actualiza el índice para que aparezca en el menú:

```bash
py generar_indice.py
```

## Atajos

| Atajo | Acción |
|---|---|
| `/` | Ir al buscador |
| `Esc` | Limpiar la búsqueda |
| `Ctrl+S` | Guardar sin salir del editor |

> **Nota:** el repositorio de GitHub Pages es público. No guardes contraseñas, tokens ni datos privados en tus apuntes.
