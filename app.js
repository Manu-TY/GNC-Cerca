let mapa;
let marcadores = [];
let marcadorDestino = null;


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
// CARGAR ESTACIONES
// ========================================

async function cargarEstaciones(lat, lon) {

    const resultado =
        document.getElementById("resultado");

    resultado.innerHTML =
        "Buscando estaciones...";


    // ========================================
    // MAPA
    // ========================================

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
            marcador =>
                mapa.removeLayer(marcador)
        );

        marcadores = [];
    }


    // ========================================
    // MARCADOR DESTINO
    // ========================================

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
            "📍 Destino<br>" +
            "Podés mover este punto."
        )
        .openPopup();


    // ========================================
    // SI SE MUEVE EL DESTINO
    // ========================================

    marcadorDestino.on(
        "dragend",
        function () {

            const posicion =
                marcadorDestino.getLatLng();

            cargarEstaciones(
                posicion.lat,
                posicion.lng
            );

        }
    );


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
                "No se pudieron obtener las estaciones de ENARGAS.";

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


                    // --------------------------------
                    // NOMBRE
                    // --------------------------------

                    const nombre =
                        a.RazonSocial ||
                        a.RAZON_SOCIAL ||
                        "Estación";


                    // --------------------------------
                    // DATOS DE ENARGAS
                    // --------------------------------

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


                    // --------------------------------
                    // COORDENADAS OFICIALES
                    // --------------------------------

                    let latEstacion =
                        parseFloat(
                            a.Latitud
                        );

                    let lonEstacion =
                        parseFloat(
                            a.Longitud
                        );


                    // --------------------------------
                    // RESPALDO
                    // --------------------------------

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


                    // --------------------------------
                    // ARMAR DIRECCIÓN
                    // --------------------------------

                    const direccionCompleta =
                        (
                            direccion +
                            " " +
                            localidad +
                            " " +
                            provincia
                        )
                        .replace(/\s+/g, " ")
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
        // ELIMINAR SIN COORDENADAS
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
        // ORDENAR
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


                // --------------------------------
                // WAZE
                // --------------------------------

                const waze =
                    "https://waze.com/ul?ll=" +
                    estacion.lat +
                    "," +
                    estacion.lon +
                    "&navigate=yes";


                // --------------------------------
                // GOOGLE MAPS
                // --------------------------------

                const maps =
                    "https://www.google.com/maps/dir/?api=1&destination=" +
                    estacion.lat +
                    "," +
                    estacion.lon;


                // --------------------------------
                // MARCADOR
                // --------------------------------

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

                    <br><br>

                    <a
                        target="_blank"
                        href="${maps}">
                        📍 Google Maps
                    </a>

                `);


                marcadores.push(
                    marcador
                );


                // --------------------------------
                // LISTA
                // --------------------------------

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


        // ========================================
        // SIN RESULTADOS
        // ========================================

        if (
            cercanas.length === 0
        ) {

            resultado.innerHTML =
                "No encontramos estaciones de GNC en la zona.";

        }


    } catch (error) {

        console.error(
            "Error:",
            error
        );

        resultado.innerHTML =
            "Ocurrió un error al consultar ENARGAS.";

    }

}


// ========================================
// BUSCAR CERCA MÍO
// ========================================

function buscar() {

    navigator.geolocation.getCurrentPosition(

        function (posicion) {

            cargarEstaciones(

                posicion.coords.latitude,

                posicion.coords.longitude

            );

        },

        function () {

            alert(
                "No pudimos obtener tu ubicación."
            );

        }

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
            "Escribí un destino."
        );

        return;
    }


    // ========================================
    // ARCGIS
    // ========================================

    const url =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates" +
        "?SingleLine=" +
        encodeURIComponent(texto) +
        "&f=json" +
        "&maxLocations=5" +
        "&outFields=Match_addr,Addr_type,Score";


    try {

        const respuesta =
            await fetch(url);

        const datos =
            await respuesta.json();


        if (
            !datos.candidates ||
            !datos.candidates.length
        ) {

            alert(
                "No encontré esa dirección."
            );

            return;
        }


        // ========================================
        // MEJOR RESULTADO
        // ========================================

        const candidato =
            datos.candidates[0];


        const lat =
            Number(
                candidato.location.y
            );


        const lon =
            Number(
                candidato.location.x
            );


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon)
        ) {

            alert(
                "No pude obtener la ubicación de esa dirección."
            );

            return;
        }


        // ========================================
        // CARGAR ESTACIONES
        // ========================================

        cargarEstaciones(
            lat,
            lon
        );


    } catch (error) {

        console.error(
            "Error:",
            error
        );

        alert(
            "No se pudo buscar la dirección."
        );

    }

}
