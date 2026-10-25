@echo off
rem Abre "Mis apuntes" en modo edicion (necesita Python instalado).
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py servidor.py) else (python servidor.py)
pause
