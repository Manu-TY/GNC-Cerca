let mapa;
let marcadores = [];

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

async function cargarEstaciones(lat, lon) {

    const resultado = document.getElementById("resultado");

    resultado.innerHTML = "Buscando estaciones...";

    if (!mapa) {

        mapa = L.map("mapa").setView([lat, lon], 13);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "© OpenStreetMap"
            }
        ).addTo(mapa);

    } else {

        mapa.setView([lat, lon], 13);

        marcadores.forEach(m => mapa.removeLayer(m));
        marcadores = [];

    }

    L.marker([lat, lon])
        .addTo(mapa)
        .bindPopup("📍 Punto de búsqueda")
        .openPopup();

    const url = "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";

    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    let estaciones = datos.features.map(e => {

        const direccion =
            (e.attributes.DIRECCION || "") +
            " " +
            (e.attributes.LOCALIDAD || "") +
            " " +
            (e.attributes.PROVINCIA || "");

        return {

            nombre:
                e.attributes.RAZON_SOCIAL ||
                e.attributes.RazonSocial ||
                "Estación",

            direccion: direccion,

            lat: e.geometry.y,
            lon: e.geometry.x

        };

    });

    estaciones.forEach(e => {

        e.distancia = distancia(
            lat,
            lon,
            e.lat,
            e.lon
        );

    });

    estaciones.sort((a, b) => a.distancia - b.distancia);

    resultado.innerHTML = "";

    estaciones.slice(0, 10).forEach(e => {

        const direccionMaps = encodeURIComponent(e.direccion);

        const waze =
            "https://waze.com/ul?ll=" +
            e.lat +
            "," +
            e.lon +
            "&navigate=yes";

        const maps =
            "https://www.google.com/maps/search/?api=1&query=" +
            direccionMaps;

        const marker = L.marker([e.lat, e.lon]).addTo(mapa);

        marker.bindPopup(`
            <b>${e.nombre}</b><br>
            ${e.direccion}<br>
            📏 ${e.distancia.toFixed(2)} km
            <br><br>
            <a target="_blank" href="${waze}">🚗 Waze</a>
            <br><br>
            <a target="_blank" href="${maps}">📍 Google Maps</a>
        `);

        marcadores.push(marker);

        resultado.innerHTML += `
            <div class="estacion">
                <h3>⛽ ${e.nombre}</h3>
                <p>${e.direccion}</p>
                <p>📏 ${e.distancia.toFixed(2)} km</p>

                <a target="_blank" href="${waze}">
                🚗 Waze
                </a>

                &nbsp;

                <a target="_blank" href="${maps}">
                📍 Google Maps
                </a>

            </div>
        `;
    });

}

function buscar() {

    navigator.geolocation.getCurrentPosition(function(pos) {

        cargarEstaciones(
            pos.coords.latitude,
            pos.coords.longitude
        );

    });

}

async function buscarDestino() {

    const texto = document
        .getElementById("destino")
        .value
        .trim();

    if (texto === "") {

        alert("Escribí un destino.");

        return;

    }

    const url =
        "https://nominatim.openstreetmap.org/search?format=json&q=" +
        encodeURIComponent(texto);

    const respuesta = await fetch(url);

    const lugares = await respuesta.json();

    if (lugares.length === 0) {

        alert("No encontré esa dirección.");

        return;

    }

    cargarEstaciones(

        parseFloat(lugares[0].lat),

        parseFloat(lugares[0].lon)

    );

}
