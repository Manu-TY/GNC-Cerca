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

async function buscar() {

    const salida = document.getElementById("resultado");

    salida.innerHTML = "Obteniendo ubicación...";

    navigator.geolocation.getCurrentPosition(async (pos) => {

        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        if (!mapa) {

            mapa = L.map('mapa').setView([lat, lon], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(mapa);

        } else {

            mapa.setView([lat, lon], 13);

            marcadores.forEach(m => mapa.removeLayer(m));
            marcadores = [];

        }

        const yo = L.marker([lat, lon]).addTo(mapa);
        yo.bindPopup("📍 Estás acá");

        marcadores.push(yo);

        const respuesta = await fetch("estaciones.json");
        const estaciones = await respuesta.json();

        estaciones.forEach(e => {
            e.distancia = distancia(lat, lon, e.lat, e.lon);
        });

        estaciones.sort((a, b) => a.distancia - b.distancia);

        salida.innerHTML = "";

        estaciones.slice(0,10).forEach(e => {

            const marker = L.marker([e.lat, e.lon]).addTo(mapa);

            marker.bindPopup(
                "<b>"+e.nombre+"</b><br>"+
                e.direccion+
                "<br><br>"+
                "<a target='_blank' href='https://waze.com/ul?ll="+e.lat+","+e.lon+"&navigate=yes'>🚗 Waze</a><br><br>"+
                "<a target='_blank' href='https://www.google.com/maps/search/?api=1&query="+e.lat+","+e.lon+"'>📍 Google Maps</a>"
            );

            marcadores.push(marker);

            salida.innerHTML += `
            <div class="estacion">
                <h3>${e.nombre}</h3>
                <p>${e.direccion}</p>
                <p><b>${e.distancia.toFixed(2)} km</b></p>
            </div>`;
        });

    });

                              }
