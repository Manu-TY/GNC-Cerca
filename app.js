let mapa;
let marcadores = [];
let marcadorDestino = null;
let marcadorUsuario = null;
let circuloPrecision = null;

let ultimaUbicacion = null;


// ========================================
// CALCULAR DISTANCIA
// ========================================

function distancia(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) * Math.PI / 180;

    const dLon =
        (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
}


// ========================================
// CREAR / ACTUALIZAR MAPA
// ========================================

function prepararMapa(lat, lon) {

    if (!mapa) {

        mapa = L.map("mapa")
            .setView([lat, lon], 14);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "© OpenStreetMap"
            }
        ).addTo(mapa);

    } else {

        mapa.setView(
            [lat, lon],
            14
        );

        marcadores.forEach(
            marcador => mapa.removeLayer(marcador)
        );

        marcadores = [];
    }
}


// ========================================
// MARCADOR DEL USUARIO
// ========================================

function mostrarUbicacionUsuario(
    lat,
    lon,
    precision
) {

    if (marcadorUsuario) {

        mapa.removeLayer(
            marcadorUsuario
        );
    }

    if (circuloPrecision) {

        mapa.removeLayer(
            circuloPrecision
        );
    }


    marcadorUsuario =
        L.marker(
            [lat, lon]
        )
        .addTo(mapa)
        .bindPopup(
            "📍 <b>Tu ubicación</b><br>" +
            "Precisión aproximada: " +
            Math.round(precision) +
            " metros"
        );


    circuloPrecision =
        L.circle(
            [lat, lon],
            {
                radius: precision
            }
        )
        .addTo(mapa);


    marcadorUsuario.openPopup();
}


// ========================================
// CARGAR ESTACIONES
// ========================================

async function cargarEstaciones(
    lat,
    lon,
    opciones = {}
) {

    const resultado =
        document.getElementById(
            "resultado"
        );


    resultado.innerHTML =
        "⏳ Buscando estaciones de GNC...";


    prepararMapa(
        lat,
        lon
    );


    // ========================================
    // MARCADOR DESTINO
    // ========================================

    if (
        opciones.tipo === "destino"
    ) {

        if (marcadorDestino) {

            mapa.removeLayer(
                marcadorDestino
            );
        }


        marcadorDestino =
            L.marker(
                [lat, lon],
                {
                    draggable: true
                }
            )
            .addTo(mapa)
            .bindPopup(
                "📍 <b>Punto de búsqueda</b><br>" +
                "Podés mover este punto."
            )
            .openPopup();


        marcadorDestino.on(
            "dragend",
            function () {

                const posicion =
                    marcadorDestino.getLatLng();

                cargarEstaciones(
                    posicion.lat,
                    posicion.lng,
                    {
                        tipo: "destino"
                    }
                );

            }
        );
    }


    // ========================================
    // CONSULTA OFICIAL ENARGAS
    // ========================================

    const url =
        "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query" +
        "?where=1%3D1" +
        "&outFields=*" +
        "&returnGeometry=true" +
        "&outSR=4326" +
        "&f=json";


    try {

        const respuesta =
            await fetch(url);

        const datos =
            await respuesta.json();


        if (
            !datos.features ||
            !datos.features.length
        ) {

            resultado.innerHTML =
                "❌ No se pudieron obtener las estaciones de ENARGAS.";

            return;
        }


        // ========================================
        // PROCESAR ESTACIONES
        // ========================================

        let estaciones =
            datos.features.map(
                estacion => {

                    const a =
                        estacion.attributes || {};


                    const nombre =
                        a.RazonSocial ||
                        a.RAZON_SOCIAL ||
                        "Estación";


                    const direccion =
                        a.Direccion ||
                        a.DIRECCION ||
                        "";


                    const localidad =
                        a.Localidad ||
                        a.LOCALIDAD ||
                        "";


                    const provincia =
                        a.Provincia ||
                        a.PROVINCIA ||
                        "";


                    let latEstacion =
                        parseFloat(
                            a.Latitud
                        );

                    let lonEstacion =
                        parseFloat(
                            a.Longitud
                        );


                    // RESPALDO GEOMETRÍA

                    if (
                        !Number.isFinite(
                            latEstacion
                        ) ||
                        !Number.isFinite(
                            lonEstacion
                        )
                    ) {

                        latEstacion =
                            parseFloat(
                                estacion.geometry?.y
                            );

                        lonEstacion =
                            parseFloat(
                                estacion.geometry?.x
                            );
                    }


                    const direccionCompleta =
                        (
                            direccion +
                            " " +
                            localidad +
                            " " +
                            provincia
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();


                    return {

                        nombre:
                            nombre
                                .toString()
                                .trim(),

                        direccion:
                            direccionCompleta,

                        lat:
                            latEstacion,

                        lon:
                            lonEstacion
                    };

                }
            );


        // ========================================
        // ELIMINAR COORDENADAS INVÁLIDAS
        // ========================================

        estaciones =
            estaciones.filter(
                estacion =>
                    Number.isFinite(
                        estacion.lat
                    ) &&
                    Number.isFinite(
                        estacion.lon
                    )
            );


        // ========================================
        // CALCULAR DISTANCIAS
        // ========================================

        estaciones.forEach(
            estacion => {

                estacion.distancia =
                    distancia(
                        lat,
                        lon,
                        estacion.lat,
                        estacion.lon
                    );

            }
        );


        // ========================================
        // ORDENAR POR DISTANCIA
        // ========================================

        estaciones.sort(
            (a, b) =>
                a.distancia -
                b.distancia
        );


        // ========================================
        // 10 MÁS CERCANAS
        // ========================================

        const cercanas =
            estaciones.slice(
                0,
                10
            );


        resultado.innerHTML = "";


        // ========================================
        // MOSTRAR RESULTADOS
        // ========================================

        cercanas.forEach(
            estacion => {

                const waze =
                    "https://waze.com/ul?ll=" +
                    estacion.lat +
                    "," +
                    estacion.lon +
                    "&navigate=yes";


                const maps =
                    "https://www.google.com/maps/dir/?api=1&destination=" +
                    estacion.lat +
                    "," +
                    estacion.lon;


                const marcador =
                    L.marker(
                        [
                            estacion.lat,
                            estacion.lon
                        ]
                    )
                    .addTo(mapa);


                marcador.bindPopup(`

                    <b>
                        ⛽ ${estacion.nombre}
                    </b>

                    <br><br>

                    ${estacion.direccion}

                    <br><br>

                    📏
                    ${estacion.distancia.toFixed(2)}
                    km

                    <br><br>

                    <a
                        target="_blank"
                        href="${waze}">
                        🚗 Waze
                    </a>

                    &nbsp;&nbsp;

                    <a
                        target="_blank"
                        href="${maps}">
                        📍 Google Maps
                    </a>

                `);


                marcadores.push(
                    marcador
                );


                resultado.innerHTML += `

                    <div class="estacion">

                        <h3>
                            ⛽
                            ${estacion.nombre}
                        </h3>

                        <p>
                            ${estacion.direccion}
                        </p>

                        <p>
                            📏
                            ${estacion.distancia.toFixed(2)}
                            km
                        </p>

                        <a
                            target="_blank"
                            href="${waze}">
                            🚗 Waze
                        </a>

                        &nbsp;&nbsp;

                        <a
                            target="_blank"
                            href="${maps}">
                            📍 Google Maps
                        </a>

                    </div>

                `;

            }
        );


        if (
            cercanas.length === 0
        ) {

            resultado.innerHTML =
                "❌ No encontramos estaciones de GNC en la zona.";

        }


    } catch (error) {

        console.error(
            "Error ENARGAS:",
            error
        );

        resultado.innerHTML =
            "❌ Ocurrió un error al consultar ENARGAS.";

    }

}


// ========================================
// BUSCAR CERCA MÍO
// ========================================

function buscar() {

    const resultado =
        document.getElementById(
            "resultado"
        );


    resultado.innerHTML =
        "📍 Buscando tu ubicación GPS precisa...<br><br>" +
        "Esperá unos segundos.";


    if (
        !navigator.geolocation
    ) {

        resultado.innerHTML =
            "❌ Este dispositivo no permite obtener ubicación.";

        return;
    }


    let mejorPosicion = null;

    let reloj = null;


    function finalizar() {

        if (reloj) {

            clearTimeout(
                reloj
            );
        }


        if (!mejorPosicion) {

            resultado.innerHTML =
                "❌ No pudimos obtener una ubicación GPS válida.";

            return;
        }


        const lat =
            mejorPosicion.coords.latitude;

        const lon =
            mejorPosicion.coords.longitude;

        const precision =
            mejorPosicion.coords.accuracy;


        ultimaUbicacion = {

            lat:
                lat,

            lon:
                lon,

            precision:
                precision
        };


        prepararMapa(
            lat,
            lon
        );


        mostrarUbicacionUsuario(
            lat,
            lon,
            precision
        );


        let aviso = "";


        if (
            precision > 100
        ) {

            aviso =
                "<br><br>⚠️ <b>La precisión del GPS es baja.</b><br>" +
                "El teléfono indica aproximadamente " +
                Math.round(precision) +
                " metros de margen.<br>" +
                "Si el marcador aparece lejos de donde estás, " +
                "el problema está en la ubicación que entrega el teléfono.";

        }


        resultado.innerHTML =
            "📍 <b>Ubicación detectada</b><br>" +
            "Precisión aproximada: " +
            Math.round(precision) +
            " metros" +
            aviso +
            "<br><br>⏳ Buscando estaciones...";


        cargarEstaciones(
            lat,
            lon,
            {
                tipo: "usuario"
            }
        );

    }


    function recibirPosicion(
        posicion
    ) {

        console.log(
            "GPS:",
            posicion.coords.latitude,
            posicion.coords.longitude,
            "Precisión:",
            posicion.coords.accuracy
        );


        if (
            !mejorPosicion ||
            posicion.coords.accuracy <
            mejorPosicion.coords.accuracy
        ) {

            mejorPosicion =
                posicion;
        }


        // Si conseguimos una precisión
        // muy buena, terminamos antes.

        if (
            posicion.coords.accuracy <= 30
        ) {

            finalizar();

        }

    }


    function errorGPS(
        error
    ) {

        console.error(
            "GPS:",
            error
        );

    }


    navigator.geolocation.watchPosition(
        recibirPosicion,
        errorGPS,
        {
            enableHighAccuracy:
                true,

            timeout:
                20000,

            maximumAge:
                0
        }
    );


    // Esperamos hasta 15 segundos
    // buscando una mejor lectura.

    reloj =
        setTimeout(
            finalizar,
            15000
        );

}


// ========================================
// BUSCAR DESTINO
// ========================================

async function buscarDestino() {

    const campo =
        document.getElementById(
            "destino"
        );


    if (!campo) {

        alert(
            "No se encontró el campo de destino."
        );

        return;
    }


    const texto =
        campo.value.trim();


    if (!texto) {

        alert(
            "Escribí una dirección."
        );

        return;
    }


    const resultado =
        document.getElementById(
            "resultado"
        );


    resultado.innerHTML =
        "🔎 Buscando dirección en Argentina...";


    // ========================================
    // ARCGIS
    // LIMITADO A ARGENTINA
    // ========================================

    const url =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates" +
        "?SingleLine=" +
        encodeURIComponent(texto) +
        "&sourceCountry=ARG" +
        "&category=Address" +
        "&maxLocations=8" +
        "&outFields=Match_addr,Addr_type,Score,City,Region,Country" +
        "&f=json";


    try {

        const respuesta =
            await fetch(url);

        const datos =
            await respuesta.json();


        if (
            !datos.candidates ||
            !datos.candidates.length
        ) {

            resultado.innerHTML =
                "❌ No encontré esa dirección en Argentina.<br><br>" +
                "Probá agregando la localidad o CABA.";

            return;
        }


        // ========================================
        // FILTRAR CANDIDATOS
        // ========================================

        let candidatos =
            datos.candidates.filter(
                candidato => {

                    const direccion =
                        (
                            candidato.address ||
                            candidato.attributes?.Match_addr ||
                            ""
                        ).toLowerCase();


                    const pais =
                        (
                            candidato.attributes?.Country ||
                            ""
                        ).toLowerCase();


                    // Si ArcGIS informa país,
                    // exigimos Argentina.

                    if (
                        pais &&
                        !pais.includes(
                            "argentina"
                        )
                    ) {

                        return false;
                    }


                    // Evitamos resultados que
                    // claramente sean países
                    // o lugares demasiado generales.

                    if (
                        direccion.includes(
                            "usa"
                        ) ||
                        direccion.includes(
                            "united states"
                        ) ||
                        direccion.includes(
                            "brasil"
                        ) ||
                        direccion.includes(
                            "brazil"
                        ) ||
                        direccion.includes(
                            "chile"
                        ) ||
                        direccion.includes(
                            "uruguay"
                        ) ||
                        direccion.includes(
                            "paraguay"
                        ) ||
                        direccion.includes(
                            "bolivia"
                        )
                    ) {

                        return false;
                    }


                    return true;

                }
            );


        if (
            candidatos.length === 0
        ) {

            resultado.innerHTML =
                "❌ No encontré una coincidencia válida en Argentina.<br><br>" +
                "Agregá la localidad, por ejemplo:<br>" +
                "<b>Independencia 3933, CABA</b>";

            return;
        }


        // ========================================
        // MOSTRAR OPCIONES
        // ========================================

        resultado.innerHTML = `

            <div class="estacion">

                <h3>
                    📍 Elegí la dirección
                </h3>

                <p>
                    No voy a elegir una ubicación por vos.
                    Seleccioná la que corresponda:
                </p>

            </div>

        `;


        candidatos.forEach(
            (candidato, indice) => {

                const lat =
                    Number(
                        candidato.location?.y
                    );

                const lon =
                    Number(
                        candidato.location?.x
                    );


                if (
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon)
                ) {

                    return;
                }


                const direccion =
                    candidato.address ||
                    candidato.attributes?.Match_addr ||
                    "Dirección encontrada";


                const score =
                    Number(
                        candidato.score
                    );


                let textoScore =
                    "";


                if (
                    Number.isFinite(score)
                ) {

                    textoScore =
                        "Coincidencia: " +
                        Math.round(score) +
                        "%";

                }


                resultado.innerHTML += `

                    <div
                        class="estacion"
                        style="
                            cursor:pointer;
                            border:2px solid #0b5ed7;
                        "
                        onclick="
                            seleccionarDestino(
                                ${lat},
                                ${lon}
                            )
                        "
                    >

                        <h3>
                            📍 ${direccion}
                        </h3>

                        <p>
                            ${textoScore}
                        </p>

                        <p>
                            👉 Tocá esta opción
                        </p>

                    </div>

                `;

            }
        );


    } catch (error) {

        console.error(
            "Error dirección:",
            error
        );


        resultado.innerHTML =
            "❌ No se pudo consultar el buscador de direcciones.";

    }

}


// ========================================
// SELECCIONAR DIRECCIÓN
// ========================================

function seleccionarDestino(
    lat,
    lon
) {

    cargarEstaciones(
        lat,
        lon,
        {
            tipo: "destino"
        }
    );

}
