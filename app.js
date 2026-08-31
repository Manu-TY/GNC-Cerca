let mapa;
let marcadores = [];
let marcadorDestino = null;

// ========================================
// CALCULAR DISTANCIA
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

    return R * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}


// ========================================
// REVERSE GEOCODING
// OBTENER DIRECCIÓN REAL DESDE COORDENADAS
// ========================================

async function obtenerDireccion(lat, lon, direccionEnargas) {

    try {

        const url =
            "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode" +
            "?location=" +
            encodeURIComponent(lon + "," + lat) +
            "&f=json";

        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        if (
            datos &&
            datos.address &&
            datos.address.Match_addr
        ) {
            return datos.address.Match_addr;
        }

    } catch (error) {

        console.log("No se pudo obtener dirección corregida:", error);

    }

    return direccionEnargas || "Dirección no disponible";
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
    // CREAR / ACTUALIZAR MAPA
    // ========================================

    if (!mapa) {

        mapa = L.map("mapa")
            .setView([lat, lon], 14);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "© OpenStreetMap"
            }
        ).addTo(mapa);

    } else {

        mapa.setView([lat, lon], 14);

        marcadores.forEach(m => {
            mapa.removeLayer(m);
        });

        marcadores = [];
    }


    // ========================================
    // MARCADOR DEL DESTINO
    // ========================================

    if (marcadorDestino) {
        mapa.removeLayer(marcadorDestino);
    }

    marcadorDestino = L.marker(
        [lat, lon],
        {
            draggable: true
        }
    )
        .addTo(mapa)
        .bindPopup(
            "📍 Destino<br>Podés mover este punto."
        );


    // Si se mueve el destino
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
        "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";


    try {

        const respuesta =
            await fetch(url);

        const datos =
            await respuesta.json();


        if (!datos.features) {

            resultado.innerHTML =
                "No se pudieron obtener las estaciones de ENARGAS.";

            return;
        }


        // ========================================
        // PROCESAR ESTACIONES
        // ========================================

        let estaciones =
            datos.features.map(e => {

                const a =
                    e.attributes || {};


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


                // ========================================
                // COORDENADAS ENARGAS
                // ========================================

                let latEstacion =
                    parseFloat(a.Latitud);

                let lonEstacion =
                    parseFloat(a.Longitud);


                // Si no existen, usar geometría
                if (
                    !Number.isFinite(latEstacion) ||
                    !Number.isFinite(lonEstacion)
                ) {

                    latEstacion =
                        parseFloat(e.geometry?.y);

                    lonEstacion =
                        parseFloat(e.geometry?.x);
                }


                const direccionEnargas =
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

                    direccionEnargas,

                    lat: latEstacion,

                    lon: lonEstacion
                };

            });


        // ========================================
        // ELIMINAR SIN COORDENADAS
        // ========================================

        estaciones =
            estaciones.filter(e =>
                Number.isFinite(e.lat) &&
                Number.isFinite(e.lon)
            );


        // ========================================
        // CALCULAR DISTANCIAS
        // ========================================

        estaciones.forEach(e => {

            e.distancia =
                distancia(
                    lat,
                    lon,
                    e.lat,
                    e.lon
                );
        });


        // ========================================
        // ORDENAR
        // ========================================

        estaciones.sort(
            (a, b) =>
                a.distancia - b.distancia
        );


        // ========================================
        // TOMAR LAS 10 MÁS CERCANAS
        // ========================================

        const cercanas =
            estaciones.slice(0, 10);


        resultado.innerHTML =
            "Procesando direcciones...";


        // ========================================
        // CORREGIR DIRECCIONES MEDIANTE
        // LAS COORDENADAS
        // ========================================

        for (const e of cercanas) {

            e.direccion =
                await obtenerDireccion(
                    e.lat,
                    e.lon,
                    e.direccionEnargas
                );
        }


        resultado.innerHTML = "";


        // ========================================
        // MOSTRAR ESTACIONES
        // ========================================

        cercanas.forEach(e => {


            // ========================================
            // WAZE
            // ========================================

            const waze =
                "https://waze.com/ul?ll=" +
                e.lat +
                "," +
                e.lon +
                "&navigate=yes";


            // ========================================
            // GOOGLE MAPS
            // ========================================

            const maps =
                "https://www.google.com/maps/dir/?api=1&destination=" +
                e.lat +
                "," +
                e.lon;


            // ========================================
            // MARCADOR
            // ========================================

            const marker =
                L.marker([
                    e.lat,
                    e.lon
                ])
                    .addTo(mapa);


            marker.bindPopup(`

                <b>⛽ ${e.nombre}</b>

                <br><br>

                ${e.direccion}

                <br><br>

                📏 ${e.distancia.toFixed(2)} km

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


            marcadores.push(marker);


            // ========================================
            // LISTA
            // ========================================

            resultado.innerHTML += `

                <div class="estacion">

                    <h3>
                        ⛽ ${e.nombre}
                    </h3>

                    <p>
                        ${e.direccion}
                    </p>

                    <p>
                        📏 ${e.distancia.toFixed(2)} km
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
        });


        if (cercanas.length === 0) {

            resultado.innerHTML =
                "No encontramos estaciones de GNC en la zona.";

        }


    } catch (error) {

        console.error(error);

        resultado.innerHTML =
            "Ocurrió un error al consultar ENARGAS.";
    }
}


// ========================================
// BUSCAR CERCA MÍO
// ========================================

function buscar() {

    navigator.geolocation.getCurrentPosition(

        function(pos) {

            cargarEstaciones(
                pos.coords.latitude,
                pos.coords.longitude
            );

        },

        function() {

            alert(
                "No pudimos obtener tu ubicación."
            );
        }
    );
}


// ========================================
// BUSCAR DESTINO CON ARCGIS
// ========================================

async function buscarDestino() {

    const elemento =
        document.getElementById("destino");


    if (!elemento) {

        alert(
            "No se encontró el campo de destino."
        );

        return;
    }


    const texto =
        elemento.value.trim();


    if (texto === "") {

        alert(
            "Escribí un destino."
        );

        return;
    }


    // ========================================
    // GEOCODIFICADOR ARCGIS
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
            datos.candidates.length === 0
        ) {

            alert(
                "No encontré esa dirección."
            );

            return;
        }


        // ========================================
        // TOMAR MEJOR RESULTADO
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

        console.error(error);

        alert(
            "No se pudo buscar la dirección."
        );
    }
}
