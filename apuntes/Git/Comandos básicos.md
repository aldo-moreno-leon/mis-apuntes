# Comandos básicos de Git

## Empezar un repositorio

```bash
git init
git remote add origin https://github.com/USUARIO/REPO.git
```

## Día a día

```bash
git status              # ver qué cambió
git add -A              # preparar todos los cambios
git commit -m "mensaje" # guardar una versión
git push                # subir a GitHub
git pull                # traer cambios de GitHub
```

## Ramas

```bash
git switch -c nueva-rama   # crear y cambiarse a una rama
git switch main            # volver a main
git merge nueva-rama       # unir la rama a la actual
```

## Deshacer cosas

```bash
git restore archivo.txt         # descartar cambios no guardados de un archivo
git restore --staged archivo.txt # sacar un archivo del "add"
git commit --amend              # corregir el último commit (antes de hacer push)
```
