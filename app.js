// ==========================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ==========================================

// PEGÁ ACÁ LA ACCESS KEY QUE RECIBISTE DE WEB3FORMS (ENTRE LAS COMILLAS)
const WEB3FORMS_ACCESS_KEY = "TU_ACCESS_KEY_AQUI"; 

// URL del Endpoint oficial de ENARGAS (ArcGIS REST Service)
const ENARGAS_API_URL = "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query";

let map = null;
let userMarker = null;
let stationMarkers = [];
let userCoords = null;

// ==========================================
// INICIALIZACIÓN DEL MAPA (LEAFLET)
// ==========================================
function initMap(lat = -34.6037, lng = -58.3816) { // Por defecto: Buenos Aires
    if (!map) {
        map = L.map('mapa').setView([lat, lng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap - Datos ENARGAS'
        }).addTo(map);

        // Permitir al usuario cambiar su ubicación haciendo clic en el mapa
        map.on('click', function(e) {
            actualizarUbicacionUsuario(e.latlng.lat, e.latlng.lng, "Ubicación seleccionada en el mapa");
        });
    } else {
        map.setView([lat, lng], 13);
    }
}

// ==========================================
// SANITIZACIÓN Y CORRECCIÓN DE COORDENADAS
// ==========================================
function sanitizarCoordenada(valor) {
    if (valor === null || valor === undefined) return null;
    let valStr = valor.toString().trim().replace(',', '.');
    let num = parseFloat(valStr);
    if (isNaN(num)) return null;
    return num;
}

function esCoordenadaValidaArgentina(lat, lng) {
    return (lat >= -56 && lat <= -20 && lng >= -76 && lng <= -52);
}

function corregirUbicacionStation(rawLat, rawLng) {
    let lat = sanitizarCoordenada(rawLat);
    let lng = sanitizarCoordenada(rawLng);

    if (lat === null || lng === null) return null;

    if (!esCoordenadaValidaArgentina(lat, lng) && esCoordenadaValidaArgentina(lng, lat)) {
        let temp = lat;
        lat = lng;
        lng = temp;
    }

    if (!esCoordenadaValidaArgentina(lat, lng)) return null;

    return { lat, lng };
}

// ==========================================
// GEOLOCALIZACIÓN GPS DEL USUARIO
// ==========================================
function buscar() {
    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#0b5ed7;">📡 Obteniendo tu ubicación exacta por GPS...</p>`;

    if (!navigator.geolocation) {
        divResultado.innerHTML = `<p style="color:red; text-align:center;">Tu navegador no soporta geolocalización GPS.</p>`;
        return;
    }

    const gpsOptions = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            actualizarUbicacionUsuario(pos.coords.latitude, pos.coords.longitude, "Tu ubicación GPS exacta");
        },
        (err) => {
            console.warn("Error GPS principal, reintentando:", err);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    actualizarUbicacionUsuario(pos.coords.latitude, pos.coords.longitude, "Tu ubicación GPS exacta");
                },
                (errorFinal) => {
                    divResultado.innerHTML = `
                        <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; text-align:center;">
                            ⚠️ No pudimos obtener tu ubicación precisa.<br>
                            Comprobá que la ubicación de tu teléfono esté activada o buscá por dirección arriba.
                        </div>
                    `;
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        },
        gpsOptions
    );
}

function actualizarUbicacionUsuario(lat, lng, tituloPopup = "Tu ubicación") {
    userCoords = { lat, lng };
    initMap(lat, lng);

    if (userMarker) {
        map.removeLayer(userMarker);
    }

    userMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    userMarker.bindPopup(`<b>📍 ${tituloPopup}</b><br><small>(Podés arrastrar este marcador si la ubicación no es exacta)</small>`).openPopup();

    userMarker.on('dragend', function(e) {
        const newPos = e.target.getLatLng();
        actualizarUbicacionUsuario(newPos.lat, newPos.lng, "Ubicación ajustada manualmente");
    });

    cargarEstacionesENARGAS(lat, lng);
}

// ==========================================
// BÚSQUEDA POR DIRECCIÓN O CIUDAD
// ==========================================
function buscarDestino() {
    const input = document.getElementById('destino').value.trim();
    if (!input) {
        alert("Por favor, ingresá una dirección o ciudad de Argentina.");
        return;
    }

    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#0b5ed7;">🔍 Buscando "${input}"...</p>`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&countrycodes=ar&limit=1`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                actualizarUbicacionUsuario(lat, lng, `Búsqueda: ${data[0].display_name.split(',')[0]}`);
            } else {
                divResultado.innerHTML = `<p style="color:red; text-align:center;">No se encontró la ubicación ingresada. Intentá ser más específico (ej: "Luján, Buenos Aires").</p>`;
            }
        })
        .catch(err => {
            console.error("Error al buscar dirección:", err);
            divResultado.innerHTML = `<p style="color:red; text-align:center;">Error al realizar la búsqueda de dirección.</p>`;
        });
}

// ==========================================
// DETECCIÓN DE BANDERA Y MARCA
// ==========================================
function detectarBandera(attributes) {
    const rawText = (
        attributes.BANDERA || 
        attributes.BANDERA_COMERCIAL || 
        attributes.MARCA || 
        attributes.EMPRESA || 
        attributes.OPERADOR || 
        attributes.RAZON_SOCIAL || 
        ""
    ).toString().toUpperCase();

    if (rawText.includes("YPF")) {
        return { nombre: "YPF", color: "#0052cc", textColor: "#ffffff" };
    } else if (rawText.includes("SHELL")) {
        return { nombre: "Shell", color: "#d90000", textColor: "#ffffff" };
    } else if (rawText.includes("AXION") || rawText.includes("ESSO")) {
        return { nombre: "Axion Energy", color: "#702082", textColor: "#ffffff" };
    } else if (rawText.includes("PUMA")) {
        return { nombre: "Puma Energy", color: "#006837", textColor: "#ffffff" };
    } else if (rawText.includes("GULF")) {
        return { nombre: "Gulf", color: "#ff6600", textColor: "#ffffff" };
    } else if (rawText.includes("REFINOR")) {
        return { nombre: "Refinor", color: "#1a237e", textColor: "#ffffff" };
    } else if (rawText.includes("VOY")) {
        return { nombre: "Voy con Energía", color: "#e65100", textColor: "#ffffff" };
    } else if (rawText.includes("DAPSA")) {
        return { nombre: "DAPSA", color: "#1976d2", textColor: "#ffffff" };
    } else {
        return { nombre: "Bandera Blanca / Otra", color: "#6c757d", textColor: "#ffffff" };
    }
}

function obtenerNombreEstacion(attributes) {
    return attributes.RAZON_SOCIAL || attributes.OPERADOR || attributes.NOMBRE || attributes.ESTACION || "Estación de GNC";
}

function obtenerDireccionEstacion(attributes) {
    let calle = attributes.DOMICILIO || attributes.DIRECCION || attributes.CALLE || "";
    let localidad = attributes.LOCALIDAD || attributes.PARTIDO || "";
    let provincia = attributes.PROVINCIA || "";

    let partes = [calle, localidad, provincia].filter(p => p && p.trim() !== "");
    return partes.length > 0 ? partes.join(", ") : "Dirección no especificada";
}

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==========================================
// CARGAR ESTACIONES DESDE ENARGAS
// ==========================================
function cargarEstacionesENARGAS(userLat, userLng) {
    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#0b5ed7;">⛽ Consultando base oficial ENARGAS...</p>`;

    stationMarkers.forEach(m => map.removeLayer(m));
    stationMarkers = [];

    const queryParams = new URLSearchParams({
        f: 'json',
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326'
    });

    fetch(`${ENARGAS_API_URL}?${queryParams.toString()}`)
        .then(res => res.json())
        .then(data => {
            if (!data.features || data.features.length === 0) {
                divResultado.innerHTML = `<p style="text-align:center; padding:15px;">No se encontraron estaciones registradas en la base de datos.</p>`;
                return;
            }

            let estacionesValidas = [];

            data.features.forEach(feature => {
                const attr = feature.attributes || {};
                const geom = feature.geometry || {};

                let rawLat = geom.y || attr.LATITUD || attr.LAT;
                let rawLng = geom.x || attr.LONGITUD || attr.LNG || attr.LON;

                let coords = corregirUbicacionStation(rawLat, rawLng);
                if (coords) {
                    const distKm = calcularDistanciaKm(userLat, userLng, coords.lat, coords.lng);
                    const banderaInfo = detectarBandera(attr);
                    const nombre = obtenerNombreEstacion(attr);
                    const direccion = obtenerDireccionEstacion(attr);

                    estacionesValidas.push({
                        nombre: nombre,
                        direccion: direccion,
                        bandera: banderaInfo,
                        lat: coords.lat,
                        lng: coords.lng,
                        distancia: distKm
                    });
                }
            });

            estacionesValidas.sort((a, b) => a.distancia - b.distancia);
            const estacionesCercanas = estacionesValidas.slice(0, 15);

            mostrarResultadoEstaciones(estacionesCercanas);
        })
        .catch(err => {
            console.error("Error al consultar ENARGAS:", err);
            divResultado.innerHTML = `
                <div style="background:#f8d7da; color:#721c24; padding:12px; border-radius:8px; text-align:center;">
                    ❌ No se pudo conectar con la base de datos del ENARGAS.<br>
                    Por favor, verificá tu conexión a internet e intentá nuevamente.
                </div>
            `;
        });
}

function mostrarResultadoEstaciones(estaciones) {
    const divResultado = document.getElementById('resultado');

    if (estaciones.length === 0) {
        divResultado.innerHTML = `<p style="text-align:center; padding:15px;">No hay estaciones de GNC cercanas a tu posición actual.</p>`;
        return;
    }

    let html = `<h2 style="font-size:1.2rem; margin-bottom:12px; color:#0b5ed7;">Estaciones de GNC encontradas (${estaciones.length}):</h2>`;

    const gncIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -30]
    });

    estaciones.forEach((e) => {
        const distTexto = e.distancia < 1 
            ? `${Math.round(e.distancia * 1000)} metros` 
            : `${e.distancia.toFixed(1)} km`;

        const marker = L.marker([e.lat, e.lng], { icon: gncIcon }).addTo(map);
        
        const popupContent = `
            <div style="font-family:sans-serif; min-width:180px;">
                <span style="display:inline-block; background:${e.bandera.color}; color:${e.bandera.textColor}; font-weight:bold; font-size:0.75rem; padding:2px 8px; border-radius:12px; margin-bottom:5px;">
                    ${e.bandera.nombre}
                </span>
                <b style="display:block; font-size:0.95rem; margin-bottom:4px;">${e.nombre}</b>
                <p style="margin:0 0 8px 0; font-size:0.85rem; color:#555;">${e.direccion}</p>
                <div style="display:flex; gap:5px;">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" style="background:#4285F4; color:white; text-decoration:none; padding:5px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">Maps</a>
                    <a href="https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes" target="_blank" style="background:#33ccff; color:black; text-decoration:none; padding:5px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">Waze</a>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        stationMarkers.push(marker);

        html += `
            <div style="background:white; border-radius:10px; padding:14px; margin-bottom:12px; box-shadow:0 2px 5px rgba(0,0,0,0.08); border-left: 5px solid ${e.bandera.color};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                    <span style="background:${e.bandera.color}; color:${e.bandera.textColor}; font-weight:bold; font-size:0.8rem; padding:3px 10px; border-radius:12px;">
                        ${e.bandera.nombre}
                    </span>
                    <span style="background:#e8f5e9; color:#2e7d32; font-weight:bold; font-size:0.85rem; padding:3px 8px; border-radius:6px;">
                        📍 a ${distTexto}
                    </span>
                </div>

                <h3 style="font-size:1.05rem; color:#111; margin-bottom:4px;">${e.nombre}</h3>
                <p style="color:#666; font-size:0.9rem; margin-bottom:12px;">${e.direccion}</p>

                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" 
                       style="flex:1; min-width:120px; text-align:center; background:#4285F4; color:white; padding:8px 10px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">
                       🚗 Google Maps
                    </a>
                    <a href="https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes" target="_blank" 
                       style="flex:1; min-width:120px; text-align:center; background:#33ccff; color:#000; padding:8px 10px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">
                       🧭 Waze
                    </a>
                </div>

                <!-- Botón de Reporte silencioso por Email -->
                <button onclick="reportarEstacionPorEmail('${e.nombre.replace(/'/g, "\\'")}', '${e.direccion.replace(/'/g, "\\'")}', ${e.lat}, ${e.lng})" 
                        style="width:100%; background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:7px; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:600;">
                    ⚠️ Reportar estación inexistente / cerrada
                </button>
            </div>
        `;
    });

    divResultado.innerHTML = html;
}

// ==========================================
// ENVÍO DE REPORTE ANÓNIMO Y PRIVADO POR EMAIL
// ==========================================
function reportarEstacionPorEmail(nombre, direccion, lat, lng) {
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === "TU_ACCESS_KEY_AQUI") {
        alert("El sistema de reportes está en mantenimiento. Por favor, probá nuevamente más tarde.");
        return;
    }

    const confirmar = confirm(`¿Querés enviar un reporte indicando que la estación "${nombre}" no existe o está cerrada?`);
    
    if (!confirmar) return;

    // Enviar solicitud invisible en segundo plano
    fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: `⚠️ Reporte GNC Inexistente: ${nombre}`,
            from_name: "App GNC Cerca",
            estacion_nombre: nombre,
            estacion_direccion: direccion,
            coordenadas: `${lat}, ${lng}`,
            mapa_link: `https://maps.google.com/?q=${lat},${lng}`
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert("✅ ¡Gracias por colaborar! El reporte fue enviado correctamente.");
        } else {
            alert("❌ Ocurrió un error al enviar el reporte. Por favor intentá más tarde.");
        }
    })
    .catch(err => {
        console.error("Error al enviar reporte:", err);
        alert("❌ Error de conexión al enviar el reporte.");
    });
}

// ==========================================
// AUTO-INICIALIZACIÓN AL CARGAR LA PÁGINA
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initMap();
});
