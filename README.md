# Encuesta: usuarios premium inactivos (Buda)

Esta app incluye:

- **El formulario público** (`/`). Tiene 13 preguntas en 5 pasos. Las opciones de P5 y P6 salen en orden aleatorio, la P4 se bloquea una vez la persona ve las opciones y, si alguien responde "No" en la P8, salta las preguntas 9 y 10.
- **Un dashboard en tiempo real** (`/dashboard`), protegido con usuario y contraseña. Muestra KPIs, la matriz de causas, gráficos, cruces, filtros, la codificación de las respuestas abiertas y la exportación a CSV.

La app no tiene dependencias. Funciona con Node 22 y la base de datos SQLite que trae Node, así que no hay que instalar nada.

---

## Desplegar en Railway (desde el navegador)

### 1. Subir a GitHub
1. En github.com, haz clic en **New repository**. Ponle un nombre, por ejemplo `encuesta-premium-buda`, y márcalo como **Private**.
2. En el repositorio vacío, haz clic en **uploading an existing file**.
3. Descomprime el .zip y arrastra **todo el contenido de la carpeta**: `server.js`, `package.json`, `railway.json`, `README.md`, `.gitignore` y la carpeta `public/`.
4. Haz clic en **Commit changes**.

### 2. Crear el servicio
1. En railway.com, ve a **New Project → Deploy from GitHub repo** y elige el repositorio.

### 3. Variables (pestaña *Variables* del servicio)
| Variable | Valor |
|---|---|
| `DASHBOARD_PASSWORD` | una contraseña segura (**obligatoria**; sin ella el dashboard no abre) |
| `DASHBOARD_USER` | opcional; si no la defines, el usuario es `admin` |

### 4. Volumen (para no perder datos)
1. En el lienzo del proyecto, haz clic derecho sobre el servicio y elige **Attach volume**. También puedes usar `Ctrl/Cmd + K` → *Add Volume*.
2. Usa como ruta de montaje (**Mount path**) `/data`.

La app detecta el volumen sola. Si no lo agregas, el dashboard muestra una alerta roja, porque las respuestas se borrarían en el siguiente despliegue.

### 5. Dominio
1. Ve a **Settings → Networking → Generate Domain**.
2. Con eso quedan:
   - Encuesta: `https://<tu-dominio>.up.railway.app/`
   - Dashboard: `https://<tu-dominio>.up.railway.app/dashboard`

---

## Enlaces personalizados (opcional)

Si agregas `?ref=CODIGO` al enlace, la respuesta queda asociada a ese cliente. Por ejemplo: `https://<tu-dominio>/?ref=U12345`.

- Si el mismo código responde dos veces, la segunda respuesta reemplaza a la primera.
- El código aparece en el dashboard y en el CSV, así que puedes cruzarlo con el volumen transaccional.
- No pongas en `ref` datos personales como el correo o la cédula. Usa un identificador interno.

## Cómo usar el dashboard

- **Resumen:** muestra los KPIs y la matriz de causas, donde cada factor se mide de cinco formas: espontánea, influyó, más determinante, importancia y retorno. Debajo están las distribuciones de cada pregunta.
- **Cruces:** compara P6 con el uso, la frecuencia, la antigüedad y la necesidad de pagos a terceros, con el porcentaje de cada columna. Las columnas con menos de 5 respuestas aparecen rayadas.
- **Respuestas abiertas:** aquí codificas la P4.
  - Las sugerencias por palabras clave aparecen con borde punteado y **no cuentan** hasta que las confirmes.
  - P5 y P6 se ocultan en esta vista para no sesgar la codificación.
  - Desde aquí también puedes eliminar las respuestas de prueba.
- **Metodología:** explica cómo leer cada métrica.
- Los datos se actualizan solos cada 10 segundos.
- Los filtros aplican a todas las vistas.

## Probar localmente (opcional)
```
DASHBOARD_PASSWORD=prueba node server.js
```
Luego abre http://localhost:3000 y http://localhost:3000/dashboard.
