// ==========================================
// GNC CERCA - APP.JS
// ==========================================

// ==========================================
// CONFIGURACIÓN Y PWA
// ==========================================

let deferredPrompt = null;

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("./sw.js")
            .then(() => console.log("Service Worker registrado"))
            .catch(err => console.warn("Error registrando Service Worker:", err));
    });
}

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const btnInstalar = document.getElementById("btnInstalarPWA");

    if (btnInstalar) {
        btnInstalar.style.display = "block";
    }
});

function instalarPWA() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;

        const btnInstalar = document.getElementById("btnInstalarPWA");

        if (btnInstalar) {
            btnInstalar.style.display = "none";
        }
    });
}

window.addEventListener("appinstalled", () => {
    deferredPrompt = null;

    const btnInstalar = document.getElementById("btnInstalarPWA");

    if (btnInstalar) {
        btnInstalar.style.display = "none";
    }
});


// ==========================================
// CONFIGURACIÓN
// ==========================================

const WEB3FORMS_ACCESS_KEY =
    "666bdb64-874a-43f6-81ab-351f14c7e494";

const ESTACIONES_ELIMINADAS = [
    "-34.626903, -58.420278",
    "-34.627778, -58.430278",
    "-34.615333, -58.415325"
];

const ENARGAS_API_URL =
    "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query";

const GEOCODE_URL =
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";


// ==========================================
// VARIABLES GLOBALES
// ==========================================

let map = null;
let userMarker = null;
let stationMarkers = [];
let userCoords = null;

let sugerenciasContainer = null;
let temporizadorSugerencias = null;
let numeroBusquedaSugerencias = 0;


// ==========================================
// ICONO ESTACIONES
// ==========================================

const gncIconClasico = L.icon({
    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",

    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",

    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


// ==========================================
// UTILIDADES
// ==========================================

function escaparHTML(valor) {

    if (valor === null || valor === undefined) {
        return "";
    }

    return String(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getAttrValue(attr, candidateKeys) {

    if (!attr || typeof attr !== "object") {
        return "";
    }

    const keys = Object.keys(attr);

    for (const cand of candidateKeys) {

        if (
            attr[cand] !== undefined &&
            attr[cand] !== null
        ) {

            const val = attr[cand]
                .toString()
                .trim();

            if (
                val !== "" &&
                val !== "null" &&
                val !== "undefined"
            ) {
                return val;
            }
        }
    }

    for (const cand of candidateKeys) {

        const candLower = cand.toLowerCase();

        for (const key of keys) {

            if (key.toLowerCase() === candLower) {

                if (
                    attr[key] !== undefined &&
                    attr[key] !== null
                ) {

                    const val = attr[key]
                        .toString()
                        .trim();

                    if (
                        val !== "" &&
                        val !== "null" &&
                        val !== "undefined"
                    ) {
                        return val;
                    }
                }
            }
        }
    }

    for (const cand of candidateKeys) {

        const candClean = cand
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

        for (const key of keys) {

            if (
                [
                    "objectid",
                    "fid",
                    "globalid",
                    "shape"
                ].includes(key.toLowerCase())
            ) {
                continue;
            }

            const keyClean = key
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");

            if (
                keyClean.includes(candClean) ||
                candClean.includes(keyClean)
            ) {

                if (
                    attr[key] !== undefined &&
                    attr[key] !== null
                ) {

                    const val = attr[key]
                        .toString()
                        .trim();

                    if (
                        val !== "" &&
                        val !== "null" &&
                        val !== "undefined"
                    ) {
                        return val;
                    }
                }
            }
        }
    }

    return "";
}


// ==========================================
// MAPA
// ==========================================

function initMap(
    lat = -34.6037,
    lng = -58.3816
) {

    if (!map) {

        map = L.map("mapa")
            .setView([lat, lng], 13);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution:
                    "© OpenStreetMap - Datos ENARGAS"
            }
        ).addTo(map);

        map.on("click", function (e) {

            actualizarUbicacionUsuario(
                e.latlng.lat,
                e.latlng.lng,
                "Ubicación seleccionada en el mapa"
            );

        });

    } else {

        map.setView([lat, lng], 13);
    }
}


// ==========================================
// COORDENADAS
// ==========================================

function sanitizarCoordenada(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return null;
    }

    const valStr = valor
        .toString()
        .trim()
        .replace(",", ".");

    const num = parseFloat(valStr);

    if (isNaN(num)) {
        return null;
    }

    return num;
}


function esCoordenadaValidaArgentina(lat, lng) {

    return (
        lat >= -56 &&
        lat <= -20 &&
        lng >= -76 &&
        lng <= -52
    );
}


function corregirUbicacionStation(
    rawLat,
    rawLng
) {

    let lat = sanitizarCoordenada(rawLat);
    let lng = sanitizarCoordenada(rawLng);

    if (
        lat === null ||
        lng === null
    ) {
        return null;
    }

    if (
        !esCoordenadaValidaArgentina(lat, lng) &&
        esCoordenadaValidaArgentina(lng, lat)
    ) {

        const temp = lat;

        lat = lng;
        lng = temp;
    }

    if (
        !esCoordenadaValidaArgentina(lat, lng)
    ) {
        return null;
    }

    return {
        lat,
        lng
    };
}


// ==========================================
// ESTACIONES ELIMINADAS
// ==========================================

function estaEliminada(lat, lng) {

    return ESTACIONES_ELIMINADAS.some(
        elim => {

            const partes = elim
                .split(",")
                .map(p => parseFloat(p.trim()));

            if (
                partes.length === 2 &&
                !isNaN(partes[0]) &&
                !isNaN(partes[1])
            ) {

                return (
                    Math.abs(partes[0] - lat) < 0.0005 &&
                    Math.abs(partes[1] - lng) < 0.0005
                );
            }

            return false;
        }
    );
}


// ==========================================
// DISTANCIA
// ==========================================

function calcularDistanciaKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;

    const dLon =
        (lon2 - lon1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            lat1 * Math.PI / 180
        ) *
        Math.cos(
            lat2 * Math.PI / 180
        ) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}


// ==========================================
// GPS - CERCA MÍO
// ==========================================

function buscar() {

    const divResultado =
        document.getElementById("resultado");

    divResultado.innerHTML = `
        <p style="
            text-align:center;
            padding:15px;
            font-weight:bold;
            color:#1976d2;
        ">
            Obteniendo ubicación GPS...
        </p>
    `;

    if (!navigator.geolocation) {

        divResultado.innerHTML = `
            <p style="
                color:red;
                text-align:center;
            ">
                Tu navegador no soporta geolocalización GPS.
            </p>
        `;

        return;
    }

    navigator.geolocation.getCurrentPosition(

        pos => {

            actualizarUbicacionUsuario(
                pos.coords.latitude,
                pos.coords.longitude,
                "Tu ubicación GPS actual"
            );

        },

        () => {

            navigator.geolocation.getCurrentPosition(

                pos => {

                    actualizarUbicacionUsuario(
                        pos.coords.latitude,
                        pos.coords.longitude,
                        "Tu ubicación GPS actual"
                    );

                },

                () => {

                    divResultado.innerHTML = `
                        <div style="
                            background:#fff3cd;
                            color:#856404;
                            padding:12px;
                            border-radius:8px;
                            text-align:center;
                        ">
                            No pudimos obtener la ubicación por GPS.
                            Podés buscar escribiendo la dirección.
                        </div>
                    `;

                },

                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                }
            );
        },

        {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0
        }
    );
}


function actualizarUbicacionUsuario(
    lat,
    lng,
    tituloPopup = "Ubicación seleccionada"
) {

    userCoords = {
        lat,
        lng
    };

    initMap(lat, lng);

    if (userMarker) {
        map.removeLayer(userMarker);
    }

    userMarker =
        L.marker(
            [lat, lng],
            {
                draggable: true
            }
        )
        .addTo(map);

    userMarker
        .bindPopup(`
            <b>${escaparHTML(tituloPopup)}</b>
            <br>
            <small>
                Podés arrastrar este marcador
                si necesitás ajustarlo.
            </small>
        `)
        .openPopup();

    userMarker.on(
        "dragend",
        function (e) {

            const newPos =
                e.target.getLatLng();

            actualizarUbicacionUsuario(
                newPos.lat,
                newPos.lng,
                "Ubicación ajustada"
            );
        }
    );

    cargarEstacionesENARGAS(
        lat,
        lng
    );
}


// ==========================================
// BUSCADOR DE DIRECCIONES
// ==========================================

function crearBuscadorSugerencias() {

    const input =
        document.getElementById("destino");

    if (!input) {
        return;
    }

    if (sugerenciasContainer) {
        return;
    }

    sugerenciasContainer =
        document.createElement("div");

    sugerenciasContainer.id =
        "sugerenciasDirecciones";

    sugerenciasContainer.style.position =
        "relative";

    sugerenciasContainer.style.zIndex =
        "10000";

    input.parentNode.insertBefore(
        sugerenciasContainer,
        input.nextSibling
    );

    input.addEventListener(
        "input",
        function () {

            const texto =
                input.value.trim();

            clearTimeout(
                temporizadorSugerencias
            );

            if (texto.length < 3) {

                ocultarSugerencias();

                return;
            }

            temporizadorSugerencias =
                setTimeout(
                    () => obtenerSugerencias(texto),
                    300
                );
        }
    );
}


function ocultarSugerencias() {

    if (!sugerenciasContainer) {
        return;
    }

    sugerenciasContainer.innerHTML = "";
}


function obtenerParametrosGeocode(
    incluirMagicKey = false,
    magicKey = ""
) {

    const params =
        new URLSearchParams();

    params.set("f", "json");
    params.set(
        "sourceCountry",
        "ARG"
    );

    params.set(
        "maxSuggestions",
        "8"
    );

    if (userCoords) {

        params.set(
            "location",
            `${userCoords.lng},${userCoords.lat}`
        );
    }

    if (
        incluirMagicKey &&
        magicKey
    ) {

        params.set(
            "magicKey",
            magicKey
        );
    }

    return params;
}


async function obtenerSugerencias(texto) {

    const numeroActual =
        ++numeroBusquedaSugerencias;

    try {

        const params =
            obtenerParametrosGeocode();

        params.set(
            "text",
            texto
        );

        const url =
            `${GEOCODE_URL}/suggest?${params.toString()}`;

        const respuesta =
            await fetch(url);

        if (!respuesta.ok) {
            throw new Error(
                "Error HTTP en sugerencias"
            );
        }

        const datos =
            await respuesta.json();

        if (
            numeroActual !==
            numeroBusquedaSugerencias
        ) {
            return;
        }

        mostrarSugerencias(
            datos.suggestions || []
        );

    } catch (error) {

        console.warn(
            "No se pudieron obtener sugerencias:",
            error
        );

        ocultarSugerencias();
    }
}


function mostrarSugerencias(
    sugerencias
) {

    if (!sugerenciasContainer) {
        return;
    }

    sugerenciasContainer.innerHTML = "";

    if (
        !sugerencias ||
        sugerencias.length === 0
    ) {
        return;
    }

    const caja =
        document.createElement("div");

    caja.style.background = "white";
    caja.style.border = "1px solid #ccc";
    caja.style.borderRadius = "8px";
    caja.style.boxShadow =
        "0 3px 10px rgba(0,0,0,.18)";
    caja.style.overflow = "hidden";
    caja.style.marginTop = "-5px";
    caja.style.marginBottom = "10px";

    sugerencias.forEach(
        sugerencia => {

            const boton =
                document.createElement("button");

            boton.type = "button";

            boton.style.width = "100%";
            boton.style.textAlign = "left";
            boton.style.background = "white";
            boton.style.color = "#222";
            boton.style.border = "none";
            boton.style.borderBottom =
                "1px solid #eee";
            boton.style.padding = "12px";
            boton.style.fontSize = "15px";
            boton.style.cursor = "pointer";
            boton.style.margin = "0";

            boton.innerHTML = `
                📍 ${escaparHTML(sugerencia.text)}
            `;

            boton.addEventListener(
                "mouseenter",
                () => {
                    boton.style.background =
                        "#f1f8e9";
                }
            );

            boton.addEventListener(
                "mouseleave",
                () => {
                    boton.style.background =
                        "white";
                }
            );

            boton.addEventListener(
                "click",
                () => {

                    document.getElementById(
                        "destino"
                    ).value =
                        sugerencia.text;

                    ocultarSugerencias();

                    resolverSugerencia(
                        sugerencia
                    );
                }
            );

            caja.appendChild(boton);
        }
    );

    sugerenciasContainer.appendChild(
        caja
    );
}


// ==========================================
// RESOLVER SUGERENCIA
// ==========================================

async function resolverSugerencia(
    sugerencia
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    divResultado.innerHTML = `
        <p style="
            text-align:center;
            padding:15px;
            font-weight:bold;
            color:#1976d2;
        ">
            Buscando ubicación...
        </p>
    `;

    try {

        const params =
            obtenerParametrosGeocode(
                true,
                sugerencia.magicKey
            );

        params.set(
            "SingleLine",
            sugerencia.text
        );

        params.set(
            "maxLocations",
            "8"
        );

        params.set(
            "outSR",
            "4326"
        );

        const respuesta =
            await fetch(
                `${GEOCODE_URL}/findAddressCandidates?${params.toString()}`
            );

        if (!respuesta.ok) {
            throw new Error(
                "Error HTTP en geocodificación"
            );
        }

        const datos =
            await respuesta.json();

        const candidatos =
            datos.candidates || [];

        if (
            candidatos.length === 0
        ) {

            mostrarErrorDireccion(
                sugerencia.text
            );

            return;
        }

        const candidato =
            candidatos[0];

        if (
            !candidato.location ||
            candidato.location.y === undefined ||
            candidato.location.x === undefined
        ) {

            mostrarErrorDireccion(
                sugerencia.text
            );

            return;
        }

        seleccionarCandidato(
            candidato
        );

    } catch (error) {

        console.error(
            "Error buscando sugerencia:",
            error
        );

        mostrarErrorDireccion(
            sugerencia.text
        );
    }
}


// ==========================================
// BUSCAR DESTINO - BOTÓN
// ==========================================

async function buscarDestino() {

    const input =
        document.getElementById(
            "destino"
        );

    const texto =
        input
            ? input.value.trim()
            : "";

    if (!texto) {

        alert(
            "Escribí una dirección, calle, localidad o intersección."
        );

        return;
    }

    ocultarSugerencias();

    const divResultado =
        document.getElementById(
            "resultado"
        );

    divResultado.innerHTML = `
        <p style="
            text-align:center;
            padding:15px;
            font-weight:bold;
            color:#1976d2;
        ">
            Buscando "${escaparHTML(texto)}"...
        </p>
    `;

    try {

        const params =
            obtenerParametrosGeocode();

        params.set(
            "SingleLine",
            texto
        );

        params.set(
            "maxLocations",
            "8"
        );

        params.set(
            "outSR",
            "4326"
        );

        const respuesta =
            await fetch(
                `${GEOCODE_URL}/findAddressCandidates?${params.toString()}`
            );

        if (!respuesta.ok) {
            throw new Error(
                "Error HTTP"
            );
        }

        const datos =
            await respuesta.json();

        let candidatos =
            datos.candidates || [];

        candidatos =
            candidatos.filter(
                candidato =>
                    candidato.location &&
                    candidato.location.x !== undefined &&
                    candidato.location.y !== undefined
            );

        if (
            candidatos.length === 0
        ) {

            // Una segunda oportunidad:
            // usamos suggest para casos como
            // "alberdi", "alberd", etc.
            await buscarConSuggestComoRespaldo(
                texto
            );

            return;
        }

        const tieneNumero =
            /\d/.test(texto);

        const primero =
            candidatos[0];

        const segundo =
            candidatos[1];

        const tipo =
            primero.attributes &&
            primero.attributes.Addr_type
                ? primero.attributes.Addr_type
                : "";

        const diferencia =
            segundo
                ? (primero.score || 0) -
                  (segundo.score || 0)
                : 999;

        /*
         * Aceptamos automáticamente solamente
         * direcciones que parecen realmente
         * precisas.
         *
         * Si es una calle sola, una intersección
         * ambigua o hay candidatos muy parecidos,
         * el usuario elige.
         */

        const esPuntoExacto =
            tipo === "PointAddress" ||
            tipo === "StreetAddress";

        const puedeAceptarAutomaticamente =
            tieneNumero &&
            esPuntoExacto &&
            (primero.score || 0) >= 95 &&
            (
                !segundo ||
                diferencia >= 2
            );

        if (
            puedeAceptarAutomaticamente
        ) {

            seleccionarCandidato(
                primero
            );

            return;
        }

        mostrarCandidatos(
            candidatos,
            texto
        );

    } catch (error) {

        console.error(
            "Error buscando dirección:",
            error
        );

        mostrarErrorDireccion(
            texto
        );
    }
}


// ==========================================
// RESPALDO CON SUGGEST
// ==========================================

async function buscarConSuggestComoRespaldo(
    texto
) {

    try {

        const params =
            obtenerParametrosGeocode();

        params.set(
            "text",
            texto
        );

        params.set(
            "maxSuggestions",
            "8"
        );

        const respuesta =
            await fetch(
                `${GEOCODE_URL}/suggest?${params.toString()}`
            );

        const datos =
            await respuesta.json();

        if (
            datos.suggestions &&
            datos.suggestions.length > 0
        ) {

            mostrarSugerenciasEnResultado(
                datos.suggestions,
                texto
            );

            return;
        }

        mostrarErrorDireccion(
            texto
        );

    } catch (error) {

        console.error(error);

        mostrarErrorDireccion(
            texto
        );
    }
}


// ==========================================
// MOSTRAR SUGERENCIAS EN RESULTADOS
// ==========================================

function mostrarSugerenciasEnResultado(
    sugerencias,
    textoOriginal
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    let html = `
        <div style="
            background:#e8f5e9;
            border:1px solid #c8e6c9;
            padding:12px;
            border-radius:8px;
            margin-bottom:15px;
        ">

            <div style="
                font-weight:bold;
                color:#2e7d32;
                margin-bottom:10px;
            ">
                No seleccioné una ubicación
                automáticamente.
                Elegí la que corresponde:
            </div>

            <div id="listaOpcionesDireccion">
    `;

    sugerencias.forEach(
        (sugerencia, indice) => {

            html += `
                <button
                    type="button"
                    data-sugerencia-index="${indice}"
                    style="
                        width:100%;
                        text-align:left;
                        background:white;
                        color:#222;
                        border:1px solid #ccc;
                        padding:12px;
                        border-radius:7px;
                        margin-bottom:8px;
                        cursor:pointer;
                        font-size:14px;
                    "
                >
                    📍 ${escaparHTML(
                        sugerencia.text
                    )}
                </button>
            `;
        }
    );

    html += `
            </div>
        </div>
    `;

    divResultado.innerHTML =
        html;

    const botones =
        divResultado.querySelectorAll(
            "[data-sugerencia-index]"
        );

    botones.forEach(
        boton => {

            boton.addEventListener(
                "click",
                () => {

                    const indice =
                        parseInt(
                            boton.getAttribute(
                                "data-sugerencia-index"
                            )
                        );

                    const sugerencia =
                        sugerencias[indice];

                    document.getElementById(
                        "destino"
                    ).value =
                        sugerencia.text;

                    resolverSugerencia(
                        sugerencia
                    );
                }
            );
        }
    );
}


// ==========================================
// MOSTRAR CANDIDATOS
// ==========================================

function mostrarCandidatos(
    candidatos,
    textoOriginal
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    let html = `
        <div style="
            background:#e8f5e9;
            border:1px solid #c8e6c9;
            padding:12px;
            border-radius:8px;
            margin-bottom:15px;
        ">

            <div style="
                font-weight:bold;
                color:#2e7d32;
                margin-bottom:10px;
            ">
                Elegí la ubicación correcta:
            </div>

            <div>
    `;

    candidatos
        .slice(0, 8)
        .forEach(
            (candidato, indice) => {

                const direccion =
                    candidato.address ||
                    "Ubicación";

                const tipo =
                    candidato.attributes &&
                    candidato.attributes.Addr_type
                        ? candidato.attributes.Addr_type
                        : "";

                let descripcionTipo = "";

                if (
                    tipo === "StreetInt"
                ) {
                    descripcionTipo =
                        "Intersección";
                } else if (
                    tipo === "StreetName"
                ) {
                    descripcionTipo =
                        "Calle";
                } else if (
                    tipo === "PointAddress" ||
                    tipo === "StreetAddress"
                ) {
                    descripcionTipo =
                        "Dirección";
                }

                html += `
                    <button
                        type="button"
                        data-candidato-index="${indice}"
                        style="
                            width:100%;
                            text-align:left;
                            background:white;
                            color:#222;
                            border:1px solid #ccc;
                            padding:12px;
                            border-radius:7px;
                            margin-bottom:8px;
                            cursor:pointer;
                            font-size:14px;
                        "
                    >
                        <b>
                            📍 ${escaparHTML(
                                direccion
                            )}
                        </b>

                        ${
                            descripcionTipo
                                ? `<br><small style="color:#666;">
                                    ${escaparHTML(
                                        descripcionTipo
                                    )}
                                   </small>`
                                : ""
                        }
                    </button>
                `;
            }
        );

    html += `
            </div>
        </div>
    `;

    divResultado.innerHTML =
        html;

    const botones =
        divResultado.querySelectorAll(
            "[data-candidato-index]"
        );

    botones.forEach(
        boton => {

            boton.addEventListener(
                "click",
                () => {

                    const indice =
                        parseInt(
                            boton.getAttribute(
                                "data-candidato-index"
                            )
                        );

                    seleccionarCandidato(
                        candidatos[indice]
                    );
                }
            );
        }
    );
}


// ==========================================
// SELECCIONAR CANDIDATO
// ==========================================

function seleccionarCandidato(
    candidato
) {

    if (
        !candidato ||
        !candidato.location
    ) {
        return;
    }

    const lat =
        parseFloat(
            candidato.location.y
        );

    const lng =
        parseFloat(
            candidato.location.x
        );

    if (
        isNaN(lat) ||
        isNaN(lng)
    ) {
        return;
    }

    const direccion =
        candidato.address ||
        "Ubicación seleccionada";

    const input =
        document.getElementById(
            "destino"
        );

    if (input) {
        input.value = direccion;
    }

    ocultarSugerencias();

    actualizarUbicacionUsuario(
        lat,
        lng,
        `Destino: ${direccion}`
    );
}


// ==========================================
// ERROR DE DIRECCIÓN
// ==========================================

function mostrarErrorDireccion(
    texto
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    divResultado.innerHTML = `
        <div style="
            background:#fff3cd;
            color:#856404;
            padding:14px;
            border-radius:8px;
            text-align:center;
        ">

            <b>No pude ubicar "${escaparHTML(texto)}"</b>

            <br><br>

            Probá agregando la localidad,
            el número o una intersección.

            <br><br>

            Ejemplos:

            <br>

            <small>
                Alberdi 2500, CABA
                <br>
                Alberdi y Rivadavia, CABA
                <br>
                Av. Independencia 3933, CABA
            </small>

        </div>
    `;
}


// ==========================================
// BANDERAS
// ==========================================

function detectarBandera(
    attributes
) {

    const rawText =
        getAttrValue(
            attributes,
            [
                "BANDERA",
                "BANDERA_COMERCIAL",
                "MARCA",
                "EMPRESA",
                "OPERADOR",
                "RAZON_SOCIAL",
                "RAZONSOCIA",
                "COMERCIALIZADORA",
                "NOMBRE"
            ]
        )
        .toUpperCase();

    if (
        rawText.includes("YPF")
    ) {

        return {
            nombre: "YPF",
            color: "#0052cc",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("SHELL")
    ) {

        return {
            nombre: "Shell",
            color: "#d90000",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("AXION") ||
        rawText.includes("ESSO")
    ) {

        return {
            nombre: "Axion Energy",
            color: "#702082",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("PUMA")
    ) {

        return {
            nombre: "Puma Energy",
            color: "#006837",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("GULF")
    ) {

        return {
            nombre: "Gulf",
            color: "#ff6600",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("REFINOR")
    ) {

        return {
            nombre: "Refinor",
            color: "#1a237e",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("VOY")
    ) {

        return {
            nombre: "Voy con Energía",
            color: "#e65100",
            textColor: "#ffffff"
        };

    } else if (
        rawText.includes("DAPSA")
    ) {

        return {
            nombre: "DAPSA",
            color: "#1976d2",
            textColor: "#ffffff"
        };

    } else {

        return {
            nombre: "Bandera Blanca / Otra",
            color: "#6c757d",
            textColor: "#ffffff"
        };
    }
}


// ==========================================
// DATOS DE ESTACIÓN
// ==========================================

function obtenerNombreEstacion(
    attributes
) {

    const val =
        getAttrValue(
            attributes,
            [
                "RAZON_SOCIAL",
                "RazonSocial",
                "RAZONSOCIA",
                "RAZON",
                "NOMBRE",
                "OPERADOR",
                "ESTACION",
                "DENOMINACION",
                "FANTASIA",
                "NOMBRE_FANTASIA",
                "EMPRESA",
                "TITULAR"
            ]
        );

    return val !== ""
        ? val
        : "Estación de GNC";
}


function obtenerDireccionEstacion(
    attributes
) {

    const calle =
        getAttrValue(
            attributes,
            [
                "DOMICILIO",
                "DIRECCION",
                "Direccion",
                "CALLE",
                "UBICACION"
            ]
        );

    const localidad =
        getAttrValue(
            attributes,
            [
                "LOCALIDAD",
                "Localidad",
                "PARTIDO",
                "MUNICIPIO",
                "CIUDAD"
            ]
        );

    const provincia =
        getAttrValue(
            attributes,
            [
                "PROVINCIA",
                "Provincia",
                "ESTADO"
            ]
        );

    const partes =
        [
            calle,
            localidad,
            provincia
        ]
        .filter(
            p =>
                p &&
                p.trim() !== ""
        );

    return partes.length > 0
        ? partes.join(", ")
        : "Dirección no especificada";
}


// ==========================================
// CARGAR ESTACIONES ENARGAS
// ==========================================

async function cargarEstacionesENARGAS(
    userLat,
    userLng
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    divResultado.innerHTML = `
        <p style="
            text-align:center;
            padding:15px;
            font-weight:bold;
            color:#2e7d32;
        ">
            Consultando estaciones de GNC en ENARGAS...
        </p>
    `;

    stationMarkers.forEach(
        marker => {

            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }
    );

    stationMarkers = [];

    const queryParams =
        new URLSearchParams({
            f: "json",
            where: "1=1",
            outFields: "*",
            returnGeometry: "true",
            outSR: "4326"
        });

    try {

        const respuesta =
            await fetch(
                `${ENARGAS_API_URL}?${queryParams.toString()}`
            );

        if (!respuesta.ok) {
            throw new Error(
                "Error consultando ENARGAS"
            );
        }

        const data =
            await respuesta.json();

        if (
            !data.features ||
            data.features.length === 0
        ) {

            divResultado.innerHTML = `
                <p style="
                    text-align:center;
                    padding:15px;
                ">
                    No se encontraron estaciones registradas.
                </p>
            `;

            return;
        }

        const estacionesValidas = [];

        data.features.forEach(
            feature => {

                const attr =
                    feature.attributes || {};

                const geom =
                    feature.geometry || {};

                const rawLat =
                    geom.y ||
                    getAttrValue(
                        attr,
                        [
                            "LATITUD",
                            "Latitud",
                            "LAT",
                            "Y"
                        ]
                    );

                const rawLng =
                    geom.x ||
                    getAttrValue(
                        attr,
                        [
                            "LONGITUD",
                            "Longitud",
                            "LNG",
                            "LON",
                            "X"
                        ]
                    );

                const coords =
                    corregirUbicacionStation(
                        rawLat,
                        rawLng
                    );

                if (!coords) {
                    return;
                }

                if (
                    estaEliminada(
                        coords.lat,
                        coords.lng
                    )
                ) {
                    return;
                }

                const distKm =
                    calcularDistanciaKm(
                        userLat,
                        userLng,
                        coords.lat,
                        coords.lng
                    );

                const banderaInfo =
                    detectarBandera(attr);

                const nombre =
                    obtenerNombreEstacion(
                        attr
                    );

                const direccion =
                    obtenerDireccionEstacion(
                        attr
                    );

                estacionesValidas.push({
                    nombre,
                    direccion,
                    bandera: banderaInfo,
                    lat: coords.lat,
                    lng: coords.lng,
                    distancia: distKm
                });
            }
        );

        estacionesValidas.sort(
            (a, b) =>
                a.distancia -
                b.distancia
        );

        const estacionesCercanas =
            estacionesValidas.slice(
                0,
                15
            );

        mostrarResultadoEstaciones(
            estacionesCercanas
        );

    } catch (err) {

        console.error(
            "Error al consultar ENARGAS:",
            err
        );

        divResultado.innerHTML = `
            <div style="
                background:#f8d7da;
                color:#721c24;
                padding:12px;
                border-radius:8px;
                text-align:center;
            ">
                No se pudo conectar con la base de datos de ENARGAS.
                Verificá tu conexión.
            </div>
        `;
    }
}


// ==========================================
// MOSTRAR ESTACIONES
// ==========================================

function mostrarResultadoEstaciones(
    estaciones
) {

    const divResultado =
        document.getElementById(
            "resultado"
        );

    if (
        estaciones.length === 0
    ) {

        divResultado.innerHTML = `
            <p style="
                text-align:center;
                padding:15px;
            ">
                No hay estaciones de GNC cercanas a tu posición.
            </p>
        `;

        return;
    }

    let html = `
        <h2 style="
            font-size:1.1rem;
            margin-bottom:12px;
            color:#2e7d32;
        ">
            Estaciones de GNC más cercanas
            (${estaciones.length}):
        </h2>
    `;

    estaciones.forEach(
        e => {

            const distTexto =
                e.distancia < 1
                    ? `${Math.round(
                        e.distancia * 1000
                    )} metros`
                    : `${e.distancia.toFixed(
                        1
                    )} km`;

            const marker =
                L.marker(
                    [e.lat, e.lng],
                    {
                        icon:
                            gncIconClasico
                    }
                )
                .addTo(map);

            const nombreSeguro =
                escaparHTML(
                    e.nombre
                );

            const direccionSegura =
                escaparHTML(
                    e.direccion
                );

            const popupContent = `
                <div style="
                    font-family:sans-serif;
                    min-width:180px;
                ">

                    <span style="
                        display:inline-block;
                        background:${e.bandera.color};
                        color:${e.bandera.textColor};
                        font-weight:bold;
                        font-size:0.75rem;
                        padding:2px 8px;
                        border-radius:12px;
                        margin-bottom:5px;
                    ">
                        ${escaparHTML(
                            e.bandera.nombre
                        )}
                    </span>

                    <b style="
                        display:block;
                        font-size:0.95rem;
                        margin-bottom:4px;
                    ">
                        ${nombreSeguro}
                    </b>

                    <p style="
                        margin:0 0 8px 0;
                        font-size:0.85rem;
                        color:#555;
                    ">
                        ${direccionSegura}
                    </p>

                    <div style="
                        display:flex;
                        gap:5px;
                    ">

                        <a
                            href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}"
                            target="_blank"
                            rel="noopener"
                            style="
                                background:#4285F4;
                                color:white;
                                text-decoration:none;
                                padding:5px 8px;
                                border-radius:4px;
                                font-size:0.8rem;
                                font-weight:bold;
                            "
                        >
                            Maps
                        </a>

                        <a
                            href="https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes"
                            target="_blank"
                            rel="noopener"
                            style="
                                background:#33ccff;
                                color:black;
                                text-decoration:none;
                                padding:5px 8px;
                                border-radius:4px;
                                font-size:0.8rem;
                                font-weight:bold;
                            "
                        >
                            Waze
                        </a>

                    </div>
                </div>
            `;

            marker.bindPopup(
                popupContent
            );

            stationMarkers.push(
                marker
            );

            html += `
                <div style="
                    background:white;
                    border-radius:10px;
                    padding:14px;
                    margin-bottom:12px;
                    box-shadow:
                        0 2px 5px
                        rgba(0,0,0,0.08);
                    border-left:
                        5px solid
                        ${e.bandera.color};
                ">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:flex-start;
                        margin-bottom:6px;
                        gap:8px;
                    ">

                        <span style="
                            background:${e.bandera.color};
                            color:${e.bandera.textColor};
                            font-weight:bold;
                            font-size:0.8rem;
                            padding:3px 10px;
                            border-radius:12px;
                        ">
                            ${escaparHTML(
                                e.bandera.nombre
                            )}
                        </span>

                        <span style="
                            background:#e8f5e9;
                            color:#2e7d32;
                            font-weight:bold;
                            font-size:0.85rem;
                            padding:3px 8px;
                            border-radius:6px;
                            white-space:nowrap;
                        ">
                            a ${distTexto}
                        </span>

                    </div>

                    <h3 style="
                        font-size:1.05rem;
                        color:#111;
                        margin-bottom:4px;
                    ">
                        ${nombreSeguro}
                    </h3>

                    <p style="
                        color:#666;
                        font-size:0.9rem;
                        margin-bottom:12px;
                    ">
                        ${direccionSegura}
                    </p>

                    <div style="
                        display:flex;
                        gap:8px;
                        flex-wrap:wrap;
                        margin-bottom:8px;
                    ">

                        <a
                            href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}"
                            target="_blank"
                            rel="noopener"
                            style="
                                flex:1;
                                min-width:120px;
                                text-align:center;
                                background:#4285F4;
                                color:white;
                                padding:8px 10px;
                                border-radius:6px;
                                text-decoration:none;
                                font-weight:bold;
                                font-size:0.85rem;
                            "
                        >
                            Google Maps
                        </a>

                        <a
                            href="https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes"
                            target="_blank"
                            rel="noopener"
                            style="
                                flex:1;
                                min-width:120px;
                                text-align:center;
                                background:#33ccff;
                                color:#000;
                                padding:8px 10px;
                                border-radius:6px;
                                text-decoration:none;
                                font-weight:bold;
                                font-size:0.85rem;
                            "
                        >
                            Waze
                        </a>

                    </div>

                    <button
                        onclick="
                            reportarEstacionPorEmail(
                                '${e.nombre
                                    .replace(/\\/g, "\\\\")
                                    .replace(/'/g, "\\'")
                                    .replace(/"/g, "&quot;")
                                }',
                                '${e.direccion
                                    .replace(/\\/g, "\\\\")
                                    .replace(/'/g, "\\'")
                                    .replace(/"/g, "&quot;")
                                }',
                                ${e.lat},
                                ${e.lng}
                            )
                        "
                        style="
                            width:100%;
                            background:#fff3cd;
                            color:#856404;
                            border:1px solid #ffeeba;
                            padding:7px;
                            border-radius:6px;
                            font-size:0.8rem;
                            cursor:pointer;
                            font-weight:600;
                        "
                    >
                        Reportar estación inexistente / cerrada
                    </button>

                </div>
            `;
        }
    );

    divResultado.innerHTML =
        html;
}


// ==========================================
// REPORTE DE ESTACIONES
// ==========================================

function reportarEstacionPorEmail(
    nombre,
    direccion,
    lat,
    lng
) {

    if (!WEB3FORMS_ACCESS_KEY) {
        return;
    }

    if (
        !confirm(
            `¿Querés reportar que la estación "${nombre}" no existe o está cerrada?`
        )
    ) {
        return;
    }

    fetch(
        "https://api.web3forms.com/submit",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",

                Accept:
                    "application/json"
            },

            body: JSON.stringify({

                access_key:
                    WEB3FORMS_ACCESS_KEY,

                subject:
                    `Reporte GNC: ${nombre}`,

                from_name:
                    "App GNC Cerca",

                estacion_nombre:
                    nombre,

                estacion_direccion:
                    direccion,

                coordenadas:
                    `${lat}, ${lng}`,

                mapa_link:
                    `https://maps.google.com/?q=${lat},${lng}`
            })
        }
    )
        .then(
            res => res.json()
        )
        .then(
            data => {

                if (data.success) {

                    alert(
                        "Reporte enviado correctamente."
                    );

                } else {

                    alert(
                        "Error al enviar el reporte."
                    );
                }
            }
        )
        .catch(
            err => {

                console.error(err);

                alert(
                    "Error de conexión al enviar reporte."
                );
            }
        );
}


// ==========================================
// ENTER EN EL BUSCADOR
// ==========================================

function configurarEnterBuscador() {

    const input =
        document.getElementById(
            "destino"
        );

    if (!input) {
        return;
    }

    input.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                buscarDestino();
            }
        }
    );
}


// ==========================================
// CERRAR SUGERENCIAS AL HACER CLICK AFUERA
// ==========================================

document.addEventListener(
    "click",
    function (event) {

        const input =
            document.getElementById(
                "destino"
            );

        if (!input) {
            return;
        }

        if (
            event.target !== input &&
            sugerenciasContainer &&
            !sugerenciasContainer.contains(
                event.target
            )
        ) {

            ocultarSugerencias();
        }
    }
);


// ==========================================
// INICIO
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initMap();

        crearBuscadorSugerencias();

        configurarEnterBuscador();
    }
);
