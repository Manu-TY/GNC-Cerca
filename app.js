let mapa;
let marcadores = [];
let marcadorDestino = null;
let marcadorUsuario = null;
let circuloPrecision = null;

let ultimaUbicacion = null;


// ========================================
// FUNCIÓN AUXILIAR: LIMPIAR COORDENADAS
// ========================================
// Arregla el problema de las comas en decimales ("-34,60" -> -34.60)
function limpiarCoordenada(valor) {
    if (valor === null || valor === undefined) return NaN;
    if (typeof valor === 'number') return valor;
    const str = String(valor).replace(',', '.').trim();
    return parseFloat(str);
}


// ========================================
// CALCULAR DISTANCIA (Fórmula Haversine)
// ========================================

function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ========================================
// CREAR / ACTUALIZAR MAPA
// ========================================

function prepararMapa(lat, lon) {
    if (!mapa) {
        mapa = L.map("mapa").setView([lat, lon], 14);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "© OpenStreetMap"
            }
        ).addTo(mapa);
    } else {
        mapa.setView([lat, lon], 14);

        marcadores.forEach(marcador => mapa.removeLayer(marcador));
        marcadores = [];
    }
}


// ========================================
// MARCADOR DEL USUARIO
// ========================================

function mostrarUbicacionUsuario(lat, lon, precision) {
    if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
    if (circuloPrecision) mapa.removeLayer(circuloPrecision);

    marcadorUsuario = L.marker([lat, lon])
        .addTo(mapa)
        .bindPopup(
            "📍 <b>Tu ubicación</b><br>" +
            "Precisión aproximada: " + Math.round(precision) + " metros"
        );

    circuloPrecision = L.circle([lat, lon], { radius: precision }).addTo(mapa);
    marcadorUsuario.openPopup();
}


// ========================================
// CARGAR ESTACIONES DE GNC
// ========================================

async function cargarEstaciones(lat, lon, opciones = {}) {
    const resultado = document.getElementById("resultado");
    resultado.innerHTML = "⏳ Buscando estaciones de GNC...";

    prepararMapa(lat, lon);

    // MARCADOR DESTINO
    if (opciones.tipo === "destino") {
        if (marcadorDestino) mapa.removeLayer(marcadorDestino);

        marcadorDestino = L.marker([lat, lon], { draggable: true })
            .addTo(mapa)
            .bindPopup("📍 <b>Punto de búsqueda</b><br>Podés mover este punto.")
            .openPopup();

        marcadorDestino.on("dragend", function () {
            const posicion = marcadorDestino.getLatLng();
            cargarEstaciones(posicion.lat, posicion.lng, { tipo: "destino" });
        });
    }

    // CONSULTA OFICIAL ENARGAS
    const url =
        "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query" +
        "?where=1%3D1" +
        "&outFields=*" +
        "&returnGeometry=true" +
        "&outSR=4326" +
        "&f=json";

    try {
        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        if (!datos.features || !datos.features.length) {
            resultado.innerHTML = "❌ No se pudieron obtener las estaciones de ENARGAS.";
            return;
        }

        // PROCESAR Y CORREGIR ESTACIONES
        let estaciones = datos.features.map(estacion => {
            const a = estacion.attributes || {};

            const nombre = a.RazonSocial || a.RAZON_SOCIAL || "Estación GNC";
            const direccion = a.Direccion || a.DIRECCION || "";
            const localidad = a.Localidad || a.LOCALIDAD || "";
            const provincia = a.Provincia || a.PROVINCIA || "";

            let latEstacion = NaN;
            let lonEstacion = NaN;

            // 1° Opción: Usar geometría del mapa (es la más precisa en ArcGIS)
            if (estacion.geometry && Number.isFinite(estacion.geometry.y) && Number.isFinite(estacion.geometry.x)) {
                latEstacion = estacion.geometry.y;
                lonEstacion = estacion.geometry.x;
            }

            // 2° Opción: Si falla la geometría, limpiar comas de los atributos de texto
            if (!Number.isFinite(latEstacion) || !Number.isFinite(lonEstacion)) {
                latEstacion = limpiarCoordenada(a.Latitud || a.LATITUD);
                lonEstacion = limpiarCoordenada(a.Longitud || a.LONGITUD);
            }

            const direccionCompleta = `${direccion} ${localidad} ${provincia}`.replace(/\s+/g, " ").trim();

            return {
                nombre: nombre.toString().trim(),
                direccion: direccionCompleta,
                lat: latEstacion,
                lon: lonEstacion
            };
        });

        // ELIMINAR COORDENADAS INVÁLIDAS
        estACIONES = estaciones.filter(
            estacion => Number.isFinite(estacion.lat) && Number.isFinite(estacion.lon)
        );

        // CALCULAR DISTANCIAS EXACTAS
        estaciones.forEach(estacion => {
            estacion.distancia = distancia(lat, lon, estacion.lat, estacion.lon);
        });

        // ORDENAR DE MENOR A MAYOR DISTANCIA
        estaciones.sort((a, b) => a.distancia - b.distancia);

        // OBTENER LAS 10 MÁS CERCANAS
        const cercanas = estaciones.slice(0, 10);

        resultado.innerHTML = "";

        if (cercanas.length === 0) {
            resultado.innerHTML = "❌ No encontramos estaciones de GNC en la zona.";
            return;
        }

        // MOSTRAR RESULTADOS
        cercanas.forEach(estacion => {
            const waze = `https://waze.com/ul?ll=${estacion.lat},${estacion.lon}&navigate=yes`;
            const maps = `https://www.google.com/maps/dir/?api=1&destination=${estacion.lat},${estacion.lon}`;

            const marcador = L.marker([estacion.lat, estacion.lon]).addTo(mapa);

            marcador.bindPopup(`
                <b>⛽ ${estacion.nombre}</b><br><br>
                ${estacion.direccion}<br><br>
                📏 <b>${estacion.distancia.toFixed(2)} km</b><br><br>
                <a target="_blank" href="${waze}">🚗 Waze</a> &nbsp;&nbsp;
                <a target="_blank" href="${maps}">📍 Google Maps</a>
            `);

            marcadores.push(marcador);

            resultado.innerHTML += `
                <div class="estacion">
                    <h3>⛽ ${estacion.nombre}</h3>
                    <p>${estacion.direccion}</p>
                    <p>📏 <b>${estacion.distancia.toFixed(2)} km</b></p>
                    <a target="_blank" href="${waze}">🚗 Waze</a> &nbsp;&nbsp;
                    <a target="_blank" href="${maps}">📍 Google Maps</a>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error ENARGAS:", error);
        resultado.innerHTML = "❌ Ocurrió un error al consultar ENARGAS.";
    }
}


// ========================================
// BUSCAR CERCA MÍO (GPS)
// ========================================

function buscar() {
    const resultado = document.getElementById("resultado");
    resultado.innerHTML = "📍 Buscando tu ubicación GPS precisa...<br><br>Esperá unos segundos.";

    if (!navigator.geolocation) {
        resultado.innerHTML = "❌ Este dispositivo no permite obtener ubicación.";
        return;
    }

    let mejorPosicion = null;
    let reloj = null;
    let watchId = null;

    function finalizar() {
        if (reloj) clearTimeout(reloj);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId); // Apagamos el GPS para ahorrar batería y no marear el código

        if (!mejorPosicion) {
            resultado.innerHTML = "❌ No pudimos obtener una ubicación GPS válida.";
            return;
        }

        const lat = mejorPosicion.coords.latitude;
        const lon = mejorPosicion.coords.longitude;
        const precision = mejorPosicion.coords.accuracy;

        ultimaUbicacion = { lat, lon, precision };

        prepararMapa(lat, lon);
        mostrarUbicacionUsuario(lat, lon, precision);

        let aviso = "";
        if (precision > 100) {
            aviso =
                "<br><br>⚠️ <b>La precisión del GPS es baja (" + Math.round(precision) + "m).</b><br>" +
                "Si estás en una computadora, la ubicación se estima por internet y suele fallar. Probá desde un celular con GPS.";
        }

        resultado.innerHTML =
            "📍 <b>Ubicación detectada</b><br>" +
            "Precisión aproximada: " + Math.round(precision) + " metros" + aviso +
            "<br><br>⏳ Buscando estaciones...";

        cargarEstaciones(lat, lon, { tipo: "usuario" });
    }

    function recibirPosicion(posicion) {
        if (!mejorPosicion || posicion.coords.accuracy < mejorPosicion.coords.accuracy) {
            mejorPosicion = posicion;
        }

        if (posicion.coords.accuracy <= 30) {
            finalizar();
        }
    }

    function errorGPS(error) {
        console.error("GPS Error:", error);
    }

    watchId = navigator.geolocation.watchPosition(recibirPosicion, errorGPS, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
    });

    reloj = setTimeout(finalizar, 10000);
}


// ========================================
// BUSCAR DESTINO
// ========================================

async function buscarDestino() {
    const campo = document.getElementById("destino");
    if (!campo) {
        alert("No se encontró el campo de destino.");
        return;
    }

    const texto = campo.value.trim();
    if (!texto) {
        alert("Escribí una dirección.");
        return;
    }

    const resultado = document.getElementById("resultado");
    resultado.innerHTML = "🔎 Buscando dirección en Argentina...";

    const url =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates" +
        "?SingleLine=" + encodeURIComponent(texto) +
        "&sourceCountry=ARG" +
        "&category=Address" +
        "&maxLocations=8" +
        "&outFields=Match_addr,Addr_type,Score,City,Region,Country" +
        "&f=json";

    try {
        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        if (!datos.candidates || !datos.candidates.length) {
            resultado.innerHTML = "❌ No encontré esa dirección en Argentina.<br><br>Probá agregando la localidad o CABA.";
            return;
        }

        let candidatos = datos.candidates.filter(candidato => {
            const direccion = (candidato.address || candidato.attributes?.Match_addr || "").toLowerCase();
            const pais = (candidato.attributes?.Country || "").toLowerCase();

            if (pais && !pais.includes("argentina")) return false;
            if (direccion.includes("usa") || direccion.includes("brasil") || direccion.includes("chile")) return false;

            return true;
        });

        if (candidatos.length === 0) {
            resultado.innerHTML = "❌ No encontré una coincidencia válida en Argentina.";
            return;
        }

        resultado.innerHTML = `
            <div class="estacion">
                <h3>📍 Elegí la dirección</h3>
                <p>Seleccioná la opción correcta:</p>
            </div>
        `;

        candidatos.forEach(candidato => {
            const lat = Number(candidato.location?.y);
            const lon = Number(candidato.location?.x);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

            const direccion = candidato.address || candidato.attributes?.Match_addr || "Dirección encontrada";

            resultado.innerHTML += `
                <div class="estacion" style="cursor:pointer; border:2px solid #0b5ed7;" onclick="seleccionarDestino(${lat}, ${lon})">
                    <h3>📍 ${direccion}</h3>
                    <p>👉 Tocá esta opción para buscar GNC acá</p>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error dirección:", error);
        resultado.innerHTML = "❌ No se pudo consultar el buscador de direcciones.";
    }
}


// ========================================
// SELECCIONAR DIRECCIÓN
// ========================================

function seleccionarDestino(lat, lon) {
    cargarEstaciones(lat, lon, { tipo: "destino" });
}
