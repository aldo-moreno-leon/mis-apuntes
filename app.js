'use strict';

/*
 * Mis apuntes: lee  apuntes/indice.json  y los archivos  apuntes/<Tema>/<Apunte>.md.
 * - En GitHub Pages funciona en modo lectura.
 * - Con  py servidor.py  se activa el modo edición (crear, editar, renombrar, eliminar).
 */

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const enc = encodeURIComponent;
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const estado = {
  temas: [],
  editable: false,
  expandidos: new Set(leerLocal('expandidos', [])),
  contenidos: new Map(), // "tema/apunte" -> texto Markdown
  busqueda: '',
  sinGuardar: false,
};

function leerLocal(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem('apuntes.' + clave)) ?? porDefecto; } catch { return porDefecto; }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem('apuntes.' + clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}
const guardarExpandidos = () => guardarLocal('expandidos', [...estado.expandidos]);

const plantilla = (nombre) => `# ${nombre}

Descripción breve: para qué sirve y cuándo usarlo.

## Comandos

\`\`\`bash
# comando de ejemplo
\`\`\`

## Pasos

1. Primer paso
2. Segundo paso
`;

/* ---------------- Datos ---------------- */

async function pedirJSON(url, opciones = {}) {
  const respuesta = await fetch(url, { cache: 'no-store', ...opciones });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);
  return datos;
}

function api(metodo, ruta, cuerpo) {
  return pedirJSON('api/' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Apuntes': '1' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
}

async function cargarTemas() {
  try {
    estado.temas = (await pedirJSON('apuntes/indice.json')).temas || [];
  } catch {
    estado.temas = [];
  }
}

async function detectarModoEdicion() {
  try { estado.editable = (await pedirJSON('api/estado')).editable === true; } catch { estado.editable = false; }
}

async function leerApunte(tema, apunte) {
  const clave = `${tema}/${apunte}`;
  if (!estado.contenidos.has(clave)) {
    const respuesta = await fetch(`apuntes/${enc(tema)}/${enc(apunte)}.md`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('No se encontró el apunte.');
    estado.contenidos.set(clave, await respuesta.text());
  }
  return estado.contenidos.get(clave);
}

const buscarTema = (nombre) => estado.temas.find((t) => t.nombre === nombre);

/* ---------------- Rutas (#/tema/X, #/apunte/X/Y, #/editar/X/Y) ---------------- */

function rutaActual() {
  const [vista, tema, apunte] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { vista: vista || 'inicio', tema, apunte };
}

const enlace = (...partes) => '#/' + partes.map(enc).join('/');

function irA(...partes) {
  const destino = enlace(...partes);
  if (location.hash === destino) mostrar();
  else location.hash = destino;
}

let hashMostrado = location.hash;
window.addEventListener('hashchange', () => {
  if (estado.sinGuardar && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) {
    history.replaceState(null, '', hashMostrado || '#/');
    return;
  }
  estado.sinGuardar = false;
  estado.busqueda = '';
  $('#buscador').value = '';
  mostrar();
});
window.addEventListener('beforeunload', (e) => { if (estado.sinGuardar) e.preventDefault(); });

/* ---------------- Menú lateral ---------------- */

function pintarMenu() {
  const { tema: temaActual, apunte: apunteActual } = rutaActual();
  const lista = $('#lista-temas');
  if (!estado.temas.length) {
    lista.innerHTML = '<p class="vacio">Aún no hay temas.</p>';
    return;
  }
  lista.innerHTML = '<ul>' + estado.temas.map((tema) => {
    const abierto = estado.expandidos.has(tema.nombre);
    const apuntes = tema.apuntes.map((apunte) => `
      <li><a href="${enlace('apunte', tema.nombre, apunte)}"
             class="${tema.nombre === temaActual && apunte === apunteActual ? 'activo' : ''}">${escapar(apunte)}</a></li>`).join('');
    return `
      <li class="tema ${abierto ? 'abierto' : ''}">
        <div class="fila-tema ${tema.nombre === temaActual && !apunteActual ? 'activo' : ''}">
          <button class="flecha" data-alternar="${escapar(tema.nombre)}" aria-label="Mostrar u ocultar apuntes">▸</button>
          <a href="${enlace('tema', tema.nombre)}">${escapar(tema.nombre)}</a>
          <span class="contador">${tema.apuntes.length}</span>
          ${estado.editable ? `<button class="mas" data-nuevo-apunte="${escapar(tema.nombre)}" title="Nuevo apunte en ${escapar(tema.nombre)}">+</button>` : ''}
        </div>
        <ul class="apuntes">${apuntes || '<li class="vacio">Sin apuntes</li>'}</ul>
      </li>`;
  }).join('') + '</ul>';
}

$('#lista-temas').addEventListener('click', (e) => {
  const alternar = e.target.closest('[data-alternar]');
  const nuevo = e.target.closest('[data-nuevo-apunte]');
  if (alternar) {
    const nombre = alternar.dataset.alternar;
    estado.expandidos.has(nombre) ? estado.expandidos.delete(nombre) : estado.expandidos.add(nombre);
    guardarExpandidos();
    pintarMenu();
  } else if (nuevo) {
    nuevoApunte(nuevo.dataset.nuevoApunte);
  } else if (e.target.closest('a')) {
    document.body.classList.remove('menu-abierto');
  }
});

$('#boton-menu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));
$('#nuevo-tema').addEventListener('click', () => nuevoTema());

/* ---------------- Markdown ---------------- */

function convertirMarkdown(texto) {
  if (window.marked) return marked.parse(texto, { gfm: true, breaks: false });
  return `<pre>${escapar(texto)}</pre>`; // Sin internet: muestra el texto tal cual.
}

function pintarMarkdown(elemento, texto) {
  elemento.innerHTML = convertirMarkdown(texto);
  elemento.querySelectorAll('pre > code').forEach((codigo) => {
    if (window.hljs) hljs.highlightElement(codigo);
    const boton = document.createElement('button');
    boton.className = 'copiar';
    boton.textContent = 'Copiar';
    boton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codigo.innerText.replace(/\n$/, ''));
        boton.textContent = '¡Copiado!';
      } catch {
        boton.textContent = 'No se pudo copiar';
      }
      setTimeout(() => { boton.textContent = 'Copiar'; }, 1500);
    });
    codigo.parentElement.appendChild(boton);
  });
  elemento.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

/* ---------------- Vistas ---------------- */

const contenido = $('#contenido');

function migas(...partes) {
  return `<nav class="migas"><a href="#/">Inicio</a>${partes.map((p) =>
    ` <span>›</span> ${p.href ? `<a href="${p.href}">${escapar(p.texto)}</a>` : `<span>${escapar(p.texto)}</span>`}`).join('')}</nav>`;
}

async function mostrar() {
  hashMostrado = location.hash;
  const { vista, tema, apunte } = rutaActual();
  if (tema) { estado.expandidos.add(tema); guardarExpandidos(); }
  pintarMenu();
  window.scrollTo(0, 0);
  try {
    if (estado.busqueda) await vistaBusqueda();
    else if (vista === 'tema' && tema) vistaTema(tema);
    else if (vista === 'apunte' && tema && apunte) await vistaApunte(tema, apunte);
    else if (vista === 'editar' && tema && apunte && estado.editable) await vistaEditor(tema, apunte);
    else vistaInicio();
  } catch (error) {
    contenido.innerHTML = `${migas()}<div class="vacio-grande"><h1>Ups</h1><p>${escapar(error.message)}</p></div>`;
  }
}

function vistaInicio() {
  const total = estado.temas.reduce((n, t) => n + t.apuntes.length, 0);
  document.title = 'Mis apuntes';
  contenido.innerHTML = `
    <header class="cabecera">
      <div>
        <h1>Mis apuntes</h1>
        <p class="sutil">${estado.temas.length} temas · ${total} apuntes</p>
      </div>
      ${estado.editable ? '<button class="boton boton-principal" data-accion="nuevo-tema">+ Nuevo tema</button>' : ''}
    </header>
    ${estado.temas.length ? `<div class="tarjetas">${estado.temas.map((t) => `
      <a class="tarjeta" href="${enlace('tema', t.nombre)}">
        <strong>${escapar(t.nombre)}</strong>
        <span class="sutil">${t.apuntes.length} ${t.apuntes.length === 1 ? 'apunte' : 'apuntes'}</span>
        <span class="lista-corta">${t.apuntes.slice(0, 4).map(escapar).join(' · ')}</span>
      </a>`).join('')}</div>`
    : `<div class="vacio-grande"><p>Todavía no hay temas.</p>
       ${estado.editable ? '<button class="boton boton-principal" data-accion="nuevo-tema">Crear mi primer tema</button>' : ''}</div>`}`;
}

function vistaTema(nombre) {
  const tema = buscarTema(nombre);
  if (!tema) throw new Error(`No existe el tema "${nombre}".`);
  document.title = `${nombre} · Mis apuntes`;
  contenido.innerHTML = `
    ${migas({ texto: nombre })}
    <header class="cabecera">
      <h1>${escapar(nombre)}</h1>
      ${estado.editable ? `<div class="acciones">
        <button class="boton boton-principal" data-accion="nuevo-apunte">+ Nuevo apunte</button>
        <button class="boton" data-accion="renombrar-tema">Renombrar</button>
        <button class="boton boton-peligro" data-accion="borrar-tema">Eliminar</button>
      </div>` : ''}
    </header>
    ${tema.apuntes.length ? `<div class="tarjetas">${tema.apuntes.map((a) => `
      <a class="tarjeta" href="${enlace('apunte', nombre, a)}"><strong>${escapar(a)}</strong></a>`).join('')}</div>`
    : `<div class="vacio-grande"><p>Este tema aún no tiene apuntes.</p>
       ${estado.editable ? '<button class="boton boton-principal" data-accion="nuevo-apunte">Crear el primer apunte</button>' : ''}</div>`}`;
}

async function vistaApunte(tema, apunte) {
  const texto = await leerApunte(tema, apunte);
  document.title = `${apunte} · ${tema}`;
  contenido.innerHTML = `
    <div class="barra-apunte">
      ${migas({ texto: tema, href: enlace('tema', tema) }, { texto: apunte })}
      ${estado.editable ? `<div class="acciones">
        <button class="boton boton-principal" data-accion="editar">Editar</button>
        <button class="boton boton-peligro" data-accion="borrar-apunte">Eliminar</button>
      </div>` : ''}
    </div>
    <article class="markdown" id="apunte"></article>`;
  pintarMarkdown($('#apunte'), texto);
}

const herramientas = [
  ['Título', '\n## ', '', 'Título'],
  ['Negrita', '**', '**', 'texto'],
  ['`código`', '`', '`', 'código'],
  ['Bloque de código', '\n```bash\n', '\n```\n', 'comando'],
  ['Lista', '\n- ', '', 'elemento'],
  ['Pasos', '\n1. ', '', 'paso'],
  ['Enlace', '[', '](https://)', 'texto'],
  ['Nota', '\n> **Nota:** ', '', 'texto'],
];

async function vistaEditor(tema, apunte) {
  const original = await leerApunte(tema, apunte);
  document.title = `Editando ${apunte}`;
  contenido.innerHTML = `
    ${migas({ texto: tema, href: enlace('tema', tema) }, { texto: apunte, href: enlace('apunte', tema, apunte) }, { texto: 'Editar' })}
    <div class="editor-cabecera">
      <label class="campo-nombre">Nombre del apunte
        <input id="nombre-apunte" value="${escapar(apunte)}" autocomplete="off">
      </label>
      <div class="acciones">
        <button class="boton" data-accion="cancelar">Cancelar</button>
        <button class="boton boton-principal" data-accion="guardar" title="Ctrl+S guarda sin salir">Guardar</button>
      </div>
    </div>
    <div class="herramientas">${herramientas.map(([texto], i) =>
      `<button class="boton boton-chico" data-herramienta="${i}">${escapar(texto)}</button>`).join('')}
      <span class="sutil">Markdown · Ctrl+S para guardar</span>
    </div>
    <div class="editor">
      <textarea id="texto" spellcheck="false"></textarea>
      <article class="markdown vista-previa" id="vista-previa"></article>
    </div>`;

  const area = $('#texto');
  const previa = $('#vista-previa');
  area.value = original;
  pintarMarkdown(previa, original);

  let espera;
  const alCambiar = () => {
    estado.sinGuardar = area.value !== original || $('#nombre-apunte').value.trim() !== apunte;
    clearTimeout(espera);
    espera = setTimeout(() => pintarMarkdown(previa, area.value), 150);
  };
  area.addEventListener('input', alCambiar);
  $('#nombre-apunte').addEventListener('input', alCambiar);

  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      alCambiar();
    }
  });

  $('.herramientas').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-herramienta]');
    if (!boton) return;
    const [, antes, despues, ejemplo] = herramientas[boton.dataset.herramienta];
    const { selectionStart: inicio, selectionEnd: fin } = area;
    const seleccion = area.value.slice(inicio, fin) || ejemplo;
    area.setRangeText(antes + seleccion + despues, inicio, fin, 'end');
    area.setSelectionRange(inicio + antes.length, inicio + antes.length + seleccion.length);
    area.focus();
    alCambiar();
  });

  area.focus();
  area.setSelectionRange(0, 0);
}

async function vistaBusqueda() {
  const texto = estado.busqueda.toLowerCase();
  document.title = `Buscar: ${estado.busqueda}`;
  contenido.innerHTML = '<p class="sutil">Buscando…</p>';
  const resultados = [];
  for (const tema of estado.temas) {
    await Promise.all(tema.apuntes.map((a) => leerApunte(tema.nombre, a).catch(() => '')));
    for (const apunte of tema.apuntes) {
      const lineas = (estado.contenidos.get(`${tema.nombre}/${apunte}`) || '')
        .split('\n').filter((l) => l.toLowerCase().includes(texto)).map((l) => l.trim());
      const enNombre = `${tema.nombre} ${apunte}`.toLowerCase().includes(texto);
      if (lineas.length || enNombre) resultados.push({ tema: tema.nombre, apunte, lineas: lineas.slice(0, 3) });
    }
  }
  if (estado.busqueda.toLowerCase() !== texto) return; // Llegó otra búsqueda mientras tanto.

  const resaltar = (linea) => escapar(linea).replace(
    new RegExp(escapar(estado.busqueda).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  contenido.innerHTML = `
    <header class="cabecera"><h1>Resultados para “${escapar(estado.busqueda)}”</h1></header>
    ${resultados.length ? `<ul class="resultados">${resultados.map((r) => `
      <li><a href="${enlace('apunte', r.tema, r.apunte)}">
        <span class="sutil">${escapar(r.tema)} ›</span> <strong>${resaltar(r.apunte)}</strong>
        ${r.lineas.map((l) => `<code class="coincidencia">${resaltar(l)}</code>`).join('')}
      </a></li>`).join('')}</ul>`
    : '<p class="sutil">No se encontró nada.</p>'}`;
}

/* ---------------- Búsqueda ---------------- */

const buscador = $('#buscador');
let esperaBusqueda;
buscador.addEventListener('input', () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(() => { estado.busqueda = buscador.value.trim(); mostrar(); }, 200);
});
buscador.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { buscador.value = ''; estado.busqueda = ''; mostrar(); }
});
document.addEventListener('keydown', (e) => {
  const escribiendo = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === '/' && !escribiendo) { e.preventDefault(); buscador.focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && rutaActual().vista === 'editar') {
    e.preventDefault();
    guardar(false);
  }
});

/* ---------------- Acciones (modo edición) ---------------- */

function pedirDatos({ titulo, campos, boton = 'Crear' }) {
  const dialogo = $('#dialogo');
  $('#dialogo-titulo').textContent = titulo;
  $('#dialogo-boton').textContent = boton;
  $('#dialogo-campos').innerHTML = campos.map((c) => `
    <label>${escapar(c.etiqueta)}
      <input name="${c.nombre}" value="${escapar(c.valor || '')}" placeholder="${escapar(c.ayuda || '')}"
             ${c.requerido ? 'required' : ''} autocomplete="off">
    </label>`).join('');
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue === 'ok' ? Object.fromEntries(new FormData($('form', dialogo))) : null);
    }, { once: true });
  });
}

function aviso(texto, tipo = 'ok') {
  const caja = $('#aviso');
  caja.textContent = texto;
  caja.className = `aviso visible ${tipo}`;
  clearTimeout(aviso.espera);
  aviso.espera = setTimeout(() => { caja.className = 'aviso'; }, tipo === 'error' ? 4000 : 2000);
}

async function intentar(accion) {
  try { await accion(); } catch (error) { aviso(error.message, 'error'); }
}

async function recargar() {
  await cargarTemas();
  pintarMenu();
}

function nuevoTema() {
  return intentar(async () => {
    const datos = await pedirDatos({
      titulo: 'Nuevo tema',
      campos: [
        { nombre: 'tema', etiqueta: 'Nombre del tema', ayuda: 'Ej. Docker, Linux, Git', requerido: true },
        { nombre: 'apunte', etiqueta: 'Primer apunte (opcional)', ayuda: 'Ej. Comandos básicos' },
      ],
    });
    if (!datos) return;
    const { tema } = await api('POST', 'tema', { nombre: datos.tema });
    estado.expandidos.add(tema);
    guardarExpandidos();
    if (datos.apunte.trim()) return crearApunte(tema, datos.apunte);
    await recargar();
    aviso(`Tema "${tema}" creado`);
    irA('tema', tema);
  });
}

function nuevoApunte(tema) {
  return intentar(async () => {
    const datos = await pedirDatos({
      titulo: `Nuevo apunte en ${tema}`,
      campos: [{ nombre: 'apunte', etiqueta: 'Nombre del apunte', ayuda: 'Ej. Instalación', requerido: true }],
    });
    if (datos) await crearApunte(tema, datos.apunte);
  });
}

async function crearApunte(tema, nombre) {
  const r = await api('POST', 'apunte', { tema, apunte: nombre, contenido: plantilla(nombre.trim()) });
  await recargar();
  irA('editar', r.tema, r.apunte);
}

async function guardar(salir = true) {
  const { tema, apunte } = rutaActual();
  await intentar(async () => {
    const contenidoNuevo = $('#texto').value;
    const r = await api('PUT', 'apunte', {
      tema, apunte, contenido: contenidoNuevo, nuevoNombre: $('#nombre-apunte').value,
    });
    estado.contenidos.delete(`${tema}/${apunte}`);
    estado.contenidos.set(`${r.tema}/${r.apunte}`, contenidoNuevo);
    estado.sinGuardar = false;
    await recargar();
    aviso('Guardado');
    if (salir) irA('apunte', r.tema, r.apunte);
    else if (r.apunte !== apunte) irA('editar', r.tema, r.apunte);
  });
}

contenido.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const { tema, apunte } = rutaActual();
  const acciones = {
    'nuevo-tema': () => nuevoTema(),
    'nuevo-apunte': () => nuevoApunte(tema),
    'editar': () => irA('editar', tema, apunte),
    'guardar': () => guardar(true),
    'cancelar': () => irA('apunte', tema, apunte),
    'renombrar-tema': () => intentar(async () => {
      const datos = await pedirDatos({
        titulo: 'Renombrar tema', boton: 'Renombrar',
        campos: [{ nombre: 'nombre', etiqueta: 'Nuevo nombre', valor: tema, requerido: true }],
      });
      if (!datos) return;
      const r = await api('PUT', 'tema', { tema, nuevoNombre: datos.nombre });
      estado.expandidos.delete(tema);
      estado.expandidos.add(r.tema);
      estado.contenidos.clear();
      await recargar();
      irA('tema', r.tema);
    }),
    'borrar-tema': () => intentar(async () => {
      if (!confirm(`¿Eliminar el tema "${tema}" y todos sus apuntes?\nSe moverán a apuntes/.papelera por si los necesitas.`)) return;
      await api('DELETE', `tema?tema=${enc(tema)}`);
      estado.expandidos.delete(tema);
      await recargar();
      aviso('Tema eliminado');
      irA();
    }),
    'borrar-apunte': () => intentar(async () => {
      if (!confirm(`¿Eliminar el apunte "${apunte}"?\nSe moverá a apuntes/.papelera por si lo necesitas.`)) return;
      await api('DELETE', `apunte?tema=${enc(tema)}&apunte=${enc(apunte)}`);
      estado.contenidos.delete(`${tema}/${apunte}`);
      await recargar();
      aviso('Apunte eliminado');
      irA('tema', tema);
    }),
  };
  acciones[boton.dataset.accion]?.();
});

/* ---------------- Inicio ---------------- */

(async function iniciar() {
  await Promise.all([cargarTemas(), detectarModoEdicion()]);
  $('#nuevo-tema').hidden = !estado.editable;
  $('#modo').textContent = estado.editable
    ? '✏️ Modo edición (local). Sube tus cambios con git push.'
    : '👀 Modo lectura. Para editar, ejecuta iniciar.bat en tu computadora.';
  mostrar();
})();
