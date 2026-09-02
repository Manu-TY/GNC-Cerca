let mapa;
let marcadores = [];
let marcadorDestino = null;
let marcadorUsuario = null;
let circuloPrecision = null;

// ========================================
// SANITIZADOR DE COORDENADAS PARA ARGENTINA
// ========================================
function sanitizarCoordenadas(rawLat, rawLon) {
    let lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat).replace(',', '.'));
    let lon = typeof rawLon === 'number' ? rawLon : parseFloat(String(rawLon).replace(',', '.'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    // En Argentina tanto Latitud como Longitud son SIEMPRE negativas
    lat = -Math.abs(lat);
    lon = -Math.abs(lon);

    // Si la latitud es mayor en valor absoluto que la longitud, están intercambiadas
    // En Argentina: Lon está entre -53 y -75 (|Lon| > 50), Lat está entre -20 y -56 (|Lat| < 56).
    if (Math.abs(lat) > Math.abs(lon)) {
        let temp = lat;
        lat = lon;
        lon = temp;
    }

    // Validar rango geográfico aproximado de Argentina
    if (lat < -56.0 || lat > -20.0 || lon < -75.0 || lon > -53.0) {
        return null; // Fuera de Argentina
    }

    return { lat, lon };
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

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap"
        }).addTo(mapa);

        // Tocar en cualquier parte del mapa para recalcular búsqueda allí
        mapa.on("click", function (e) {
            actualizarUbicacionManual(e.latlng.lat, e.latlng.lng);
        });
    } else {
        mapa.setView([lat, lon], 14);
        marcadores.forEach(m => mapa.removeLayer(m));
        marcadores = [];
    }
}

// ========================================
// MOSTRAR Y PERMITIR MOVER MI UBICACIÓN
// ========================================
function mostrarUbicacionUsuario(lat, lon, precision = 0) {
    if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
    if (circuloPrecision) mapa.removeLayer(circuloPrecision);

    // Permitir arrastrar el marcador del usuario por si el GPS le pifia
    marcadorUsuario = L.marker([lat, lon], { draggable: true })
        .addTo(mapa)
        .bindPopup(
            "📍 <b>Tu ubicación</b><br>" +
            (precision ? "Precisión GPS: ~" + Math.round(precision) + "m<br>" : "") +
            "<i>👉 Podés arrastrar este marcador si no es tu posición exacta.</i>"
        );

    if (precision && precision > 0) {
        circuloPrecision = L.circle([lat, lon], { radius: precision, color: '#0b5ed7', fillOpacity: 0.15 }).addTo(mapa);
    }

    marcadorUsuario.openPopup();

    marcadorUsuario.on("dragend", function () {
        const pos = marcadorUsuario.getLatLng();
        actualizarUbicacionManual(pos.lat, pos.lng);
    });
}

function actualizarUbicacionManual(lat, lon) {
    if (circuloPrecision) mapa.removeLayer(circuloPrecision);
    mostrarUbicacionUsuario(lat, lon, 0);
    cargarEstaciones(lat, lon, { tipo: "usuario" });
}

// ========================================
// CARGAR ESTACIONES DE GNC (ENARGAS)
// ========================================
async function cargarEstaciones(lat, lon, opciones = {}) {
    const resultado = document.getElementById("resultado");
    if (!resultado) return;

    resultado.innerHTML = "⏳ Buscando estaciones de GNC...";

    prepararMapa(lat, lon);

    // MARCADOR DESTINO (SI BUSCÓ DIRECCIÓN)
    if (opciones.tipo === "destino") {
        if (marcadorDestino) mapa.removeLayer(marcadorDestino);

        marcadorDestino = L.marker([lat, lon], { draggable: true })
            .addTo(mapa)
            .bindPopup("📍 <b>Punto de búsqueda</b><br>Podés arrastrar este punto.")
            .openPopup();

        marcadorDestino.on("dragend", function () {
            const pos = marcadorDestino.getLatLng();
            cargarEstaciones(pos.lat, pos.lng, { tipo: "destino" });
        });
    }

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

        let estacionesProcesadas = [];

        datos.features.forEach(estacion => {
            const a = estacion.attributes || {};

            const nombre = a.RazonSocial || a.RAZON_SOCIAL || a.Nombre || "Estación GNC";
            const direccion = a.Direccion || a.DIRECCION || "";
            const localidad = a.Localidad || a.LOCALIDAD || "";
            const provincia = a.Provincia || a.PROVINCIA || "";

            let rawLat = null;
            let rawLon = null;

            // 1. Probar geometría del servicio ArcGIS
            if (estacion.geometry && estacion.geometry.y && estacion.geometry.x) {
                rawLat = estacion.geometry.y;
                rawLon = estacion.geometry.x;
            }

            // 2. Si falla, probar atributos de texto
            if (!rawLat || !rawLon) {
                rawLat = a.Latitud || a.LATITUD || a.latitud;
                rawLon = a.Longitud || a.LONGITUD || a.longitud;
            }

            // Sanitizar coordenadas para Argentina
            const coords = sanitizarCoordenadas(rawLat, rawLon);

            if (coords) {
                const dist = distancia(lat, lon, coords.lat, coords.lon);
                const direccionCompleta = `${direccion} ${localidad} ${provincia}`.replace(/\s+/g, " ").trim();

                estacionesProcesadas.push({
                    nombre: String(nombre).trim(),
                    direccion: direccionCompleta || "Dirección no informada",
                    lat: coords.lat,
                    lon: coords.lon,
                    distancia: dist
                });
            }
        });

        // Ordenar por distancia (de menor a mayor)
        estacionesProcesadas.sort((a, b) => a.distancia - b.distancia);

        // Tomar las 10 más cercanas
        const cercanas = estacionesProcesadas.slice(0, 10);

        resultado.innerHTML = "";

        if (cercanas.length === 0) {
            resultado.innerHTML = "❌ No encontramos estaciones de GNC cercanas a este punto.";
            return;
        }

        cercanas.forEach(estacion => {
            const waze = `https://waze.com/ul?ll=${estacion.lat},${estacion.lon}&navigate=yes`;
            const maps = `https://www.google.com/maps/dir/?api=1&destination=${estacion.lat},${estacion.lon}`;

            const marcador = L.marker([estacion.lat, estacion.lon]).addTo(mapa);

            marcador.bindPopup(`
                <b>⛽ ${estacion.nombre}</b><br><br>
                📍 ${estacion.direccion}<br><br>
                📏 <b>${estacion.distancia.toFixed(2)} km</b><br><br>
                <a target="_blank" href="${waze}">🚗 Abrir en Waze</a> &nbsp;&nbsp;
                <a target="_blank" href="${maps}">📍 Google Maps</a>
            `);

            marcadores.push(marcador);

            resultado.innerHTML += `
                <div class="estacion" style="margin-bottom: 12px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fff;">
                    <h3 style="margin-top:0;">⛽ ${estacion.nombre}</h3>
                    <p style="margin: 4px 0;">📍 ${estacion.direccion}</p>
                    <p style="margin: 4px 0;">📏 <b>${estacion.distancia.toFixed(2)} km</b></p>
                    <div style="margin-top: 8px;">
                        <a target="_blank" href="${waze}" style="margin-right:15px; font-weight:bold; text-decoration:none; color:#0d6efd;">🚗 Waze</a>
                        <a target="_blank" href="${maps}" style="font-weight:bold; text-decoration:none; color:#198754;">📍 Google Maps</a>
                    </div>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error ENARGAS:", error);
        resultado.innerHTML = "❌ Ocurrió un error al consultar los datos oficiales de ENARGAS.";
    }
}

// ========================================
// BUSCAR CERCA MÍO (GPS)
// ========================================
function buscar() {
    const resultado = document.getElementById("resultado");
    if (!resultado) return;

    resultado.innerHTML = "📍 Solicitando GPS del teléfono...<br><br>Si el navegador pide permiso de ubicación, seleccionalo.";

    if (!navigator.geolocation) {
        resultado.innerHTML = "❌ Tu dispositivo o navegador no admite geolocalización.";
        return;
    }

    const opcionesGPS = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (posicion) => {
            const lat = posicion.coords.latitude;
            const lon = posicion.coords.longitude;
            const precision = posicion.coords.accuracy;

            prepararMapa(lat, lon);
            mostrarUbicacionUsuario(lat, lon, precision);

            let mensajePrecision = "";
            if (precision > 100) {
                mensajePrecision = "<br>⚠️ <i>Margen de precisión GPS amplio (~" + Math.round(precision) + "m). Podés arrastrar el marcador en el mapa para ajustar tu posición real.</i>";
            }

            resultado.innerHTML = `📍 <b>Ubicación detectada</b> ${mensajePrecision}<br><br>⏳ Buscando estaciones...`;

            cargarEstaciones(lat, lon, { tipo: "usuario" });
        },
        (error) => {
            console.error("GPS Error:", error);
            resultado.innerHTML = "❌ No se pudo obtener la ubicación exacta del celular.<br>Asegurate de activar el GPS y dar permisos de ubicación en el navegador, o buscá ingresando una dirección arriba.";
        },
        opcionesGPS
    );
}

// ========================================
// BUSCAR DIRECCIÓN (OpenStreetMap + ArcGIS)
// ========================================
async function buscarDestino() {
    const campo = document.getElementById("destino");
    if (!campo) return;

    const texto = campo.value.trim();
    if (!texto) {
        alert("Escribí una dirección o ciudad.");
        return;
    }

    const resultado = document.getElementById("resultado");
    if (!resultado) return;

    resultado.innerHTML = "🔎 Buscando dirección en Argentina...";

    try {
        // 1. Intentar primero con OpenStreetMap Nominatim
        const urlOSM = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}&countrycodes=ar&limit=5`;
        const resOSM = await fetch(urlOSM);
        const datosOSM = await resOSM.json();

        let candidatos = [];

        if (datosOSM && datosOSM.length > 0) {
            candidatos = datosOSM.map(item => ({
                direccion: item.display_name,
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon)
            }));
        } else {
            // 2. Fallback a ArcGIS
            const urlArcGIS = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(texto + ", Argentina")}&maxLocations=5&f=json`;
            const resArcGIS = await fetch(urlArcGIS);
            const datosArcGIS = await resArcGIS.json();

            if (datosArcGIS && datosArcGIS.candidates) {
                candidatos = datosArcGIS.candidates.map(c => ({
                    direccion: c.address || c.attributes?.Match_addr || "Dirección encontrada",
                    lat: parseFloat(c.location?.y),
                    lon: parseFloat(c.location?.x)
                }));
            }
        }

        // Filtrar coordenadas válidas en Argentina
        candidatos = candidatos.filter(c => {
            const coords = sanitizarCoordenadas(c.lat, c.lon);
            return coords !== null;
        });

        if (candidatos.length === 0) {
            resultado.innerHTML = "❌ No encontramos esa dirección en Argentina.<br><br>Probá agregando la ciudad o provincia (ej: <i>Belgrano 500, Mendoza</i> o <i>Corrientes 1200, CABA</i>).";
            return;
        }

        resultado.innerHTML = `
            <div style="margin-bottom:10px;">
                <h3>📍 Seleccioná la ubicación correcta:</h3>
            </div>
        `;

        candidatos.forEach(c => {
            resultado.innerHTML += `
                <div class="estacion" style="cursor:pointer; border:2px solid #0b5ed7; padding:12px; margin-bottom:10px; border-radius:8px; background:#f8f9fa;" onclick="seleccionarDestino(${c.lat}, ${c.lon})">
                    <h3 style="margin:0 0 5px 0; color:#0b5ed7;">📍 ${c.direccion}</h3>
                    <p style="margin:0; font-size:0.9em; color:#555;">👉 Tocá acá para buscar estaciones cercanas a esta dirección</p>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error al buscar dirección:", error);
        resultado.innerHTML = "❌ Ocurrió un error al buscar la dirección.";
    }
}

// ========================================
// SELECCIONAR DIRECCIÓN
// ========================================
function seleccionarDestino(lat, lon) {
    cargarEstaciones(lat, lon, { tipo: "destino" });
}
