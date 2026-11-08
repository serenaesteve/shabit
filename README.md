# shabit

Tu rutina diaria de hábitos: se ordenan por la mañana, la tarde y la noche, se marcan con un toque y las rachas crecen. Es una app web instalable (PWA) que funciona en iPhone y Android sin pasar por las tiendas.

- **Web de presentación:** https://shabit.serenaesteve.com
- **App:** https://shabit.serenaesteve.com/app/ (en Safari: Compartir › Añadir a pantalla de inicio; en Chrome: menú › Instalar aplicación)

## Qué hace

**Hoy**
- Hábitos agrupados por momento del día.
- Tira con la semana para marcar días pasados.
- Botón redondo para marcar y aviso «Deshacer» tras cada cambio.
- Hoja de opciones al tocar la tarjeta: hecho, descanso o sin marcar, una nota para ese día, pausar, y acceso al progreso o a editar.
- Filtros por etiqueta (salud, mente, ejercicio, casa, trabajo, aprender, social).
- **Pausar** un hábito 1 semana, 2, 1 mes o hasta reanudarlo: no aparece, no avisa y no rompe la racha.

**Tipos de hábito**
- **Hecho o no.**
- **Cantidad:** p. ej. 8 vasos; cada toque suma uno.
- **Tiempo:** temporizador con barra para pausar o terminar.
- **Pasos:** se marca solo al llegar.
- **Dejar algo:** cada día sin hacerlo cuenta solo; si recaes lo apuntas y la racha vuelve a empezar.

**Frecuencia**
- **Unos días a la semana:** de 1 a 7.
- **Días concretos:** p. ej. lunes, miércoles y viernes. Los días que no tocan no aparecen en Hoy y no rompen la racha.
- **Veces al mes:** p. ej. llamar a la abuela 2 veces; la racha se cuenta en meses.

**Descansos.** Un día de descanso no cuenta como hecho, pero tampoco rompe la racha, y rebaja el objetivo de esa semana.

**Motivación**
- Celebración al completar el día y racha de días completos.
- 13 logros (entre ellos reto superado, una semana y un mes sin recaer, y un año de hábitos).
- **Retos** de 7, 21, 30, 66 o 100 días, con fecha de fin y si se ha superado.
- **Compartir** el progreso como imagen (racha y semana) desde la ficha o desde Progreso.
- **Un compañero:** enlace de solo lectura para que alguien vea tus hábitos y días (sin notas ni ánimo). Se quita cuando quieras.
- Ánimo y nota del día, con una idea de cómo te sientes los días que cumples.

**Rutinas listas.** Mañana con energía, Dormir mejor, Moverme más y Mente tranquila.

**Ordenar.** Arrastrando, o con flechas para accesibilidad, también entre momentos del día.

**Recordatorios.** Notificaciones push a la hora de cada hábito (hasta 3 por hábito), solo si aún no está hecho. Opcionales: resumen de la mañana con lo que toca hoy, e informe del domingo a las 20:00 con el porcentaje de la semana.

**Atajos del iPhone.** Cada hábito puede tener un enlace que lo marca como hecho hoy sin abrir la app (Atajos, Siri, un NFC…).

**Progreso.** Semana, rachas, constancia, cuadrícula de 5 semanas, meta y calendario por hábito. Además:
- mapa del último año y mejor día de la semana;
- por hábito: mejor día, hora a la que sueles hacerlo, porcentaje por meses y notas del mes;
- informe imprimible (Guardar en PDF) y exportación a CSV para Excel o Numbers.

**Datos.** Se guardan en el dispositivo (para funcionar sin conexión) y en **SBD**, ligados a una cuenta anónima (un código secreto, sin nombre ni email). Con ese código se usa la misma rutina en otro móvil; si dos móviles cambian cosas a la vez, se juntan. Para pasar a otro móvil, el código también sale como QR. Desde Ajustes se pueden borrar los datos del servidor. También hay copia en JSON, seis colores (clara, arena, menta, lavanda, oscura y como el sistema) y tres tamaños de letra.

## Estructura

```
web/                 página de presentación (index.html, estilos.css, demo.js, img/, fuentes/)
web/app/             la app: index.html, app.css, sw.js, manifest.webmanifest
web/app/js/
  progreso.js        rachas, descansos, días concretos, veces al mes, pausas, dejar algo, retos, días completos
  extras.js          estadísticas, mapa del año, informe y CSV, imagen para compartir, QR, vista del compañero
  qrcode.js          generador de QR (qrcode-generator 1.4.4, MIT, Kazuhiko Arase)
  logros.js          logros calculados a partir de los datos
  rutinas.js         rutinas listas
  pasos.js           detector de pasos con el acelerómetro
  almacen.js         datos locales y copia de seguridad
  nube.js            guardar en SBD, usar en otro móvil, juntar cambios
  avisos.js          suscripción push
  vistas.js          pantallas
  main.js            navegación, acciones, temporizador, celebraciones, arrastrar
servidor/            shabit.py (API y recordatorios), bd.py (SBD), push.py (cifrado y VAPID), cifras.py (panel),
                     esquema.sbd, procedimientos.sbd, sbd/ (copia de SBD)
despliegue/          Apache, servicio systemd y desplegar.sh
pruebas-web/         pruebas en WebKit (motor de Safari) con iPhone emulado
respaldos/           copia de la antigua versión Android (no se publica)
```

## Datos en SBD y recordatorios

El servidor (`servidor/shabit.py`) escucha en `127.0.0.1:8102`; Apache le pasa `/api/`. Guarda los datos en la base `shabit` del SBD de producción con el usuario `shabit_app`, que solo llega a esa base. La clave está en `/srv/shabit-avisos/datos/sbd.json` y no va al repositorio.

**Esquema** (`servidor/esquema.sbd`, en el lenguaje de SBD):
- `cuentas`, `habitos`, `meses`, `animo`, `suscripciones`, `enviados`, `compartidos` (enlaces de compañero) y `atajos`.
- Cada fila de `meses` es un mes de un hábito, con un carácter por día (`H` hecho, `D` descanso, `R` recaída), y las notas, horas y cantidades de ese mes. Es así porque SBD guarda cada fila en memoria: 5 años de 20 hábitos son 1.200 filas.
- Al borrar una cuenta, todo lo suyo se borra en cascada.

**Procedimientos almacenados** (`servidor/procedimientos.sbd`): `habitos_de`, `meses_de`, `marcar_hecho` (lo usa el enlace de Atajos), `cifras`, `habitos_populares` y `habitos_por_tipo`. Se vuelven a crear cada vez que arranca el servidor.

**Panel de cifras:** `python3 servidor/cifras.py --sbd /srv/shabit-avisos/datos/sbd.json` (o `--json`). Solo da totales: cuentas, activas y nuevas en 7 días, con avisos, hábitos por tipo y los más comunes.

**Cómo se guardan los datos:**
- La app manda una instantánea y `servidor/bd.py` escribe en una transacción solo las filas que han cambiado.
- Cada cuenta lleva un número de versión. Si otro móvil guardó antes, el servidor responde 409 con lo que hay, y la app lo junta con lo suyo y vuelve a guardar.

| | |
|---|---|
| `POST /api/cuenta` | crea una cuenta anónima y devuelve su código |
| `GET` · `PUT /api/datos` | lee o guarda los datos (`Authorization: Bearer <código>`) |
| `DELETE /api/cuenta` | borra la cuenta y todos sus datos |
| `POST` · `DELETE /api/suscripcion` | suscripción push del navegador |
| `GET /api/clave` | clave pública VAPID |
| `POST` · `GET` · `DELETE /api/compartir` | crea, consulta o quita el enlace de compañero |
| `GET /api/ver/<token>` | lo que ve el compañero (público, sin notas ni ánimo) |
| `POST /api/atajo` | crea el enlace de Atajos de un hábito |
| `GET` · `POST /api/atajo/<token>` | `GET` enseña un botón; `POST` marca el hábito como hecho hoy |

**Recordatorios:**
- Cada 20 segundos, el servidor busca en SBD las cuentas con suscripción y los hábitos con hora de aviso.
- Antes de avisar mira en `meses` si ya están hechos (o, en los de dejar algo, si ya ha recaído). No avisa de hábitos en pausa ni de los días que no tocan.
- Resumen de la mañana a la hora elegida, e informe los domingos a las 20:00.
- Avisa hasta 10 minutos tarde si va con retraso.
- Las notificaciones van cifradas (RFC 8291) y firmadas con VAPID (RFC 8292), y solo a los servicios de push de Apple, Google, Mozilla y Microsoft.

El paquete SBD va copiado en `servidor/sbd/`, como en `gestor-inventario`. Así el servidor no depende de la instalación de producción, y las pruebas arrancan un SBD propio y temporal: nunca usan el 8090.

En iPhone, los avisos necesitan iOS 16.4 o superior y la app añadida a la pantalla de inicio.

## Pruebas

```bash
/root/life-dashboard/.venv/bin/python pruebas-web/pruebas.py [carpeta-capturas]   # 97: lógica, interfaz, SBD con dos móviles y rendimiento
cd servidor && python3 -m unittest prueba_shabit -v                              # 18 del servidor, contra un SBD temporal
```

**Rendimiento** (20 hábitos con 5 años de días): en la app, 291 KB de datos y cada pantalla en menos de 100 ms; en el servidor, crear la cuenta 0,4 s, leerla 70 ms, guardar un cambio 100 ms y el repaso de avisos 25 ms.

`?demo` en la URL de la app carga datos de ejemplo si no hay hábitos. Las capturas de la web se regeneran con `pruebas-web/capturas_web.py` y después `pruebas-web/a_webp.py`.

## Desplegar

```bash
bash despliegue/desplegar.sh
```

El script:
- copia `web/` a `/var/www/shabit`;
- instala el servidor en `/srv/shabit-avisos` (usuario `shabit`, servicio `shabit-avisos`);
- la primera vez, con `despliegue/integrar-sbd.sh`: hace una copia de SBD y crea la base `shabit`, el usuario `shabit_app` y su clave;
- configura Apache y el certificado.

Si cambia algún archivo de la app, hay que subir `VERSION` en `web/app/sw.js`.

La antigua app nativa de Android está guardada en `/root/backups/shabit-android-2026-11-07.tar.gz` (código y clave de firma).
