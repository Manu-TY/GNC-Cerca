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

    lat = -Math.abs(lat);
    lon = -Math.abs(lon);

    if (Math.abs(lat) > Math.abs(lon)) {
        let temp = lat;
        lat = lon;
        lon = temp;
    }

    if (lat < -56.0 || lat > -20.0 || lon < -75.0 || lon > -53.0) {
        return null;
    }

    return { lat, lon };
}

// ========================================
// CALCULAR DISTANCIA (Haversine)
// ========================================
function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
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
// MOSTRAR UBICACIÓN DEL USUARIO
// ========================================
function mostrarUbicacionUsuario(lat, lon, precision = 0) {
    if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
    if (circuloPrecision) mapa.removeLayer(circuloPrecision);

    marcadorUsuario = L.marker([lat, lon], { draggable: true })
        .addTo(mapa)
        .bindPopup(
            "📍 <b>Tu ubicación</b><br>" +
            (precision ? "Margen GPS: ~" + Math.round(precision) + "m<br>" : "") +
            "<i>👉 Podés arrastrar si querés ajustar.</i>"
        );

    if (precision && precision > 0) {
        circuloPrecision = L.circle([lat, lon], { radius: precision, color: '#0b5ed7', fillOpacity: 0.12 }).addTo(mapa);
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
// CARGAR ESTACIONES DE GNC
// ========================================
async function cargarEstaciones(lat, lon, opciones = {}) {
    const resultado = document.getElementById("resultado");
    if (!resultado) return;

    resultado.innerHTML = "⏳ Buscando estaciones de GNC...";

    prepararMapa(lat, lon);

    if (opciones.tipo === "destino") {
        if (marcadorDestino) mapa.removeLayer(marcadorDestino);

        marcadorDestino = L.marker([lat, lon], { draggable: true })
            .addTo(mapa)
            .bindPopup("📍 <b>Punto de búsqueda</b><br>Podés mover este punto.")
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

            if (estacion.geometry && estacion.geometry.y && estacion.geometry.x) {
                rawLat = estacion.geometry.y;
                rawLon = estacion.geometry.x;
            }

            if (!rawLat || !rawLon) {
                rawLat = a.Latitud || a.LATITUD || a.latitud;
                rawLon = a.Longitud || a.LONGITUD || a.longitud;
            }

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

        estacionesProcesadas.sort((a, b) => a.distancia - b.distancia);
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
// BUSCAR CERCA MÍO (GPS CON AFINACIÓN SATELITAL)
// ========================================
function buscar() {
    const resultado = document.getElementById("resultado");
    if (!resultado) return;

    resultado.innerHTML = "📡 Conectando con satélites GPS...<br><br>Esperá unos segundos para fijar la precisión exacta.";

    if (!navigator.geolocation) {
        resultado.innerHTML = "❌ Tu dispositivo no admite geolocalización.";
        return;
    }

    let mejorPosicion = null;
    let watchId = null;
    let temporizador = null;

    function finalizarGPS() {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (temporizador) clearTimeout(temporizador);

        if (!mejorPosicion) {
            resultado.innerHTML = "❌ No se pudo obtener señal GPS. Probá en un espacio abierto o buscá por dirección arriba.";
            return;
        }

        const lat = mejorPosicion.coords.latitude;
        const lon = mejorPosicion.coords.longitude;
        const precision = mejorPosicion.coords.accuracy;

        prepararMapa(lat, lon);
        mostrarUbicacionUsuario(lat, lon, precision);

        resultado.innerHTML = `📍 <b>Ubicación detectada (margen: ~${Math.round(precision)}m)</b><br><br>⏳ Cargando estaciones...`;

        cargarEstaciones(lat, lon, { tipo: "usuario" });
    }

    // Escuchamos varias lecturas seguidas para filtrar la señal falsa de antenas
    watchId = navigator.geolocation.watchPosition(
        (posicion) => {
            if (!mejorPosicion || posicion.coords.accuracy < mejorPosicion.coords.accuracy) {
                mejorPosicion = posicion;
            }

            // Si obtenemos una precisión excelente (menor a 25 metros), cortamos al instante
            if (posicion.coords.accuracy <= 25) {
                finalizarGPS();
            }
        },
        (error) => {
            console.error("Error GPS:", error);
            if (!mejorPosicion) finalizarGPS();
        },
        {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0
        }
    );

    // Damos un tiempo máximo de 6 segundos para recopilar la mejor señal disponible
    temporizador = setTimeout(finalizarGPS, 6000);
}

// ========================================
// BUSCAR DIRECCIÓN
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
