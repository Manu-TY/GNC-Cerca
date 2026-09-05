// ==========================================
// CONFIGURACIÓN Y PWA INSTALL PROMPT
// ==========================================

let deferredPrompt = null;

// Registro del Service Worker para cumplir requisitos PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.warn('Error registrando Service Worker', err));
    });
}

// Captura del evento de instalación
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Muestra el botón de instalación si la app no está instalada
    const btnInstalar = document.getElementById('btnInstalarPWA');
    if (btnInstalar) {
        btnInstalar.style.display = 'block';
    }
});

function instalarPWA() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('El usuario aceptó la instalación');
        }
        deferredPrompt = null;
        const btnInstalar = document.getElementById('btnInstalarPWA');
        if (btnInstalar) btnInstalar.style.display = 'none';
    });
}

window.addEventListener('appinstalled', () => {
    console.log('PWA instalada exitosamente');
    const btnInstalar = document.getElementById('btnInstalarPWA');
    if (btnInstalar) btnInstalar.style.display = 'none';
    deferredPrompt = null;
});

// ==========================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ==========================================

const WEB3FORMS_ACCESS_KEY = "666bdb64-874a-43f6-81ab-351f14c7e494"; 

const ESTACIONES_ELIMINADAS = [
    "-34.626903, -58.420278", 
    "-34.627778, -58.430278" 
];

const ENARGAS_API_URL = "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query";

let map = null;
let userMarker = null;
let stationMarkers = [];
let userCoords = null;

const gncIconClasico = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function getAttrValue(attr, candidateKeys) {
    if (!attr || typeof attr !== 'object') return "";
    
    const keys = Object.keys(attr);
    
    for (let cand of candidateKeys) {
        if (attr[cand] !== undefined && attr[cand] !== null) {
            let val = attr[cand].toString().trim();
            if (val !== "" && val !== "null" && val !== "undefined") return val;
        }
    }

    for (let cand of candidateKeys) {
        const candLower = cand.toLowerCase();
        for (let key of keys) {
            if (key.toLowerCase() === candLower) {
                if (attr[key] !== undefined && attr[key] !== null) {
                    let val = attr[key].toString().trim();
                    if (val !== "" && val !== "null" && val !== "undefined") return val;
                }
            }
        }
    }

    for (let cand of candidateKeys) {
        const candClean = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let key of keys) {
            if (['objectid', 'fid', 'globalid', 'shape'].includes(key.toLowerCase())) continue;
            
            const keyClean = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (keyClean.includes(candClean) || candClean.includes(keyClean)) {
                if (attr[key] !== undefined && attr[key] !== null) {
                    let val = attr[key].toString().trim();
                    if (val !== "" && val !== "null" && val !== "undefined") return val;
                }
            }
        }
    }

    return "";
}

function initMap(lat = -34.6037, lng = -58.3816) {
    if (!map) {
        map = L.map('mapa').setView([lat, lng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap - Datos ENARGAS'
        }).addTo(map);

        map.on('click', function(e) {
            actualizarUbicacionUsuario(e.latlng.lat, e.latlng.lng, "Ubicación seleccionada en el mapa");
        });
    } else {
        map.setView([lat, lng], 13);
    }
}

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

function estaEliminada(lat, lng) {
    return ESTACIONES_ELIMINADAS.some(elim => {
        let partes = elim.split(',').map(p => parseFloat(p.trim()));
        if (partes.length === 2 && !isNaN(partes[0]) && !isNaN(partes[1])) {
            return Math.abs(partes[0] - lat) < 0.0005 && Math.abs(partes[1] - lng) < 0.0005;
        }
        return false;
    });
}

function buscar() {
    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#1976d2;">Obteniendo ubicación GPS...</p>`;

    if (!navigator.geolocation) {
        divResultado.innerHTML = `<p style="color:red; text-align:center;">Tu navegador no soporta geolocalización GPS.</p>`;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            actualizarUbicacionUsuario(pos.coords.latitude, pos.coords.longitude, "Tu ubicación GPS actual");
        },
        (err) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    actualizarUbicacionUsuario(pos.coords.latitude, pos.coords.longitude, "Tu ubicación GPS actual");
                },
                (errorFinal) => {
                    divResultado.innerHTML = `
                        <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; text-align:center;">
                            No pudimos obtener la ubicación por GPS. Podés buscar escribiendo la dirección en el buscador.
                        </div>
                    `;
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
}

function actualizarUbicacionUsuario(lat, lng, tituloPopup = "Ubicación seleccionada") {
    userCoords = { lat, lng };
    initMap(lat, lng);

    if (userMarker) {
        map.removeLayer(userMarker);
    }

    userMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    userMarker.bindPopup(`<b>${tituloPopup}</b><br><small>(Podés arrastrar este marcador si necesitás ajustarlo)</small>`).openPopup();

    userMarker.on('dragend', function(e) {
        const newPos = e.target.getLatLng();
        actualizarUbicacionUsuario(newPos.lat, newPos.lng, "Ubicación ajustada");
    });

    cargarEstacionesENARGAS(lat, lng);
}

function buscarDestino() {
    const inputDireccion = document.getElementById('destino') ? document.getElementById('destino').value.trim() : "";

    if (!inputDireccion) {
        alert("Por favor, ingresá una dirección o localidad.");
        return;
    }

    const query = `${inputDireccion}, Argentina`;
    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#1976d2;">Buscando "${inputDireccion}"...</p>`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=6`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (!data || data.length === 0) {
                divResultado.innerHTML = `
                    <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; text-align:center;">
                        No se encontraron resultados para "${inputDireccion}".<br>
                        <small>Verificá la escritura o agregá la localidad (ej: Belgrano 500, Avellaneda).</small>
                    </div>`;
                return;
            }

            let html = `
                <div style="background:#e8f5e9; border:1px solid #c8e6c9; padding:12px; border-radius:8px; margin-bottom:15px;">
                    <p style="margin:0 0 10px 0; font-weight:bold; color:#2e7d32; font-size:0.95rem;">
                        Elegí la opción correcta:
                    </p>
                    <div style="display:flex; flex-direction:column; gap:8px;">
            `;

            data.forEach((item) => {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lon);
                const nombreLimpio = item.display_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const tituloPrincipal = item.display_name.split(',')[0];

                html += `
                    <button onclick="seleccionarOpcionDestino(${lat}, ${lng}, '${nombreLimpio}')" 
                            style="text-align:left; background:white; border:1px solid #ced4da; padding:10px 12px; border-radius:6px; cursor:pointer; font-size:0.88rem; transition:all 0.2s;"
                            onmouseover="this.style.background='#f1f8e9'; this.style.borderColor='#2e7d32';" 
                            onmouseout="this.style.background='white'; this.style.borderColor='#ced4da';">
                        <b style="color:#111;">📍 ${tituloPrincipal}</b><br>
                        <small style="color:#6c757d;">${item.display_name}</small>
                    </button>
                `;
            });

            html += `</div></div>`;
            divResultado.innerHTML = html;
        })
        .catch(err => {
            console.error("Error al buscar dirección:", err);
            divResultado.innerHTML = `<p style="color:red; text-align:center;">Error al realizar la búsqueda de dirección.</p>`;
        });
}

function seleccionarOpcionDestino(lat, lng, nombreCompleto) {
    const titulo = nombreCompleto.split(',')[0];
    actualizarUbicacionUsuario(lat, lng, `Ubicación: ${titulo}`);
}

function detectarBandera(attributes) {
    const rawText = getAttrValue(attributes, [
        "BANDERA", "BANDERA_COMERCIAL", "MARCA", "EMPRESA", "OPERADOR", 
        "RAZON_SOCIAL", "RAZONSOCIA", "COMERCIALIZADORA", "NOMBRE"
    ]).toUpperCase();

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
    const val = getAttrValue(attributes, [
        "RAZON_SOCIAL", "RAZONSOCIA", "RAZON", "NOMBRE", "OPERADOR", 
        "ESTACION", "DENOMINACION", "FANTASIA", "NOMBRE_FANTASIA", "EMPRESA", "TITULAR"
    ]);
    return val !== "" ? val : "Estación de GNC";
}

function obtenerDireccionEstacion(attributes) {
    let calle = getAttrValue(attributes, ["DOMICILIO", "DIRECCION", "CALLE", "UBICACION"]);
    let localidad = getAttrValue(attributes, ["LOCALIDAD", "PARTIDO", "MUNICIPIO", "CIUDAD"]);
    let provincia = getAttrValue(attributes, ["PROVINCIA", "ESTADO"]);

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

function cargarEstacionesENARGAS(userLat, userLng) {
    const divResultado = document.getElementById('resultado');
    divResultado.innerHTML = `<p style="text-align:center; padding:15px; font-weight:bold; color:#2e7d32;">Consultando estaciones de GNC en ENARGAS...</p>`;

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
                divResultado.innerHTML = `<p style="text-align:center; padding:15px;">No se encontraron estaciones registradas.</p>`;
                return;
            }

            let estacionesValidas = [];

            data.features.forEach(feature => {
                const attr = feature.attributes || {};
                const geom = feature.geometry || {};

                let rawLat = geom.y || getAttrValue(attr, ["LATITUD", "LAT", "Y"]);
                let rawLng = geom.x || getAttrValue(attr, ["LONGITUD", "LNG", "LON", "X"]);

                let coords = corregirUbicacionStation(rawLat, rawLng);
                if (coords) {
                    if (estaEliminada(coords.lat, coords.lng)) return;

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
                    No se pudo conectar con la base de datos de ENARGAS. Verificá tu conexión.
                </div>
            `;
        });
}

function mostrarResultadoEstaciones(estaciones) {
    const divResultado = document.getElementById('resultado');

    if (estaciones.length === 0) {
        divResultado.innerHTML = `<p style="text-align:center; padding:15px;">No hay estaciones de GNC cercanas a tu posición.</p>`;
        return;
    }

    let html = `<h2 style="font-size:1.1rem; margin-bottom:12px; color:#2e7d32;">Estaciones de GNC más cercanas (${estaciones.length}):</h2>`;

    estaciones.forEach((e) => {
        const distTexto = e.distancia < 1 
            ? `${Math.round(e.distancia * 1000)} metros` 
            : `${e.distancia.toFixed(1)} km`;

        const marker = L.marker([e.lat, e.lng], { icon: gncIconClasico }).addTo(map);
        
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

        const nombreLimpio = e.nombre.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const direccionLimpia = e.direccion.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        html += `
            <div style="background:white; border-radius:10px; padding:14px; margin-bottom:12px; box-shadow:0 2px 5px rgba(0,0,0,0.08); border-left: 5px solid ${e.bandera.color};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                    <span style="background:${e.bandera.color}; color:${e.bandera.textColor}; font-weight:bold; font-size:0.8rem; padding:3px 10px; border-radius:12px;">
                        ${e.bandera.nombre}
                    </span>
                    <span style="background:#e8f5e9; color:#2e7d32; font-weight:bold; font-size:0.85rem; padding:3px 8px; border-radius:6px;">
                        a ${distTexto}
                    </span>
                </div>

                <h3 style="font-size:1.05rem; color:#111; margin-bottom:4px;">${e.nombre}</h3>
                <p style="color:#666; font-size:0.9rem; margin-bottom:12px;">${e.direccion}</p>

                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" 
                       style="flex:1; min-width:120px; text-align:center; background:#4285F4; color:white; padding:8px 10px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">
                       Google Maps
                    </a>
                    <a href="https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes" target="_blank" 
                       style="flex:1; min-width:120px; text-align:center; background:#33ccff; color:#000; padding:8px 10px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">
                       Waze
                    </a>
                </div>

                <button onclick="reportarEstacionPorEmail('${nombreLimpio}', '${direccionLimpia}', ${e.lat}, ${e.lng})" 
                        style="width:100%; background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:7px; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:600;">
                    Reportar estación inexistente / cerrada
                </button>
            </div>
        `;
    });

    divResultado.innerHTML = html;
}

function reportarEstacionPorEmail(nombre, direccion, lat, lng) {
    if (!WEB3FORMS_ACCESS_KEY) return;

    if (!confirm(`¿Querés reportar que la estación "${nombre}" no existe o está cerrada?`)) return;

    fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: `Reporte GNC: ${nombre}`,
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
            alert("Reporte enviado correctamente.");
        } else {
            alert("Error al enviar el reporte.");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Error de conexión al enviar reporte.");
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initMap();
});
