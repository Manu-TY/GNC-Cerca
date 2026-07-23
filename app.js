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

    salida.innerHTML = "Buscando estaciones cercanas...";


    navigator.geolocation.getCurrentPosition(async function(pos) {


        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;


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


            marcadores.forEach(function(m) {
                mapa.removeLayer(m);
            });


            marcadores = [];

        }



        const miUbicacion = L.marker([lat, lon])
            .addTo(mapa)
            .bindPopup("📍 Tu ubicación")
            .openPopup();


        marcadores.push(miUbicacion);



        const respuesta = await fetch("estaciones.json");

        const estaciones = await respuesta.json();



        estaciones.forEach(function(e){

            e.distancia = distancia(
                lat,
                lon,
                e.lat,
                e.lon
            );

        });



        estaciones.sort(function(a,b){
            return a.distancia - b.distancia;
        });



        salida.innerHTML = "";



        estaciones.slice(0,10).forEach(function(e){


            const waze =
            "https://waze.com/ul?ll=" +
            e.lat + "," + e.lon +
            "&navigate=yes";


            const maps =
            "https://www.google.com/maps/search/?api=1&query=" +
            e.lat + "," + e.lon;



            const marcador = L.marker([
                e.lat,
                e.lon
            ])
            .addTo(mapa);



            marcador.bindPopup(`

                <b>⛽ ${e.nombre}</b>
                <br>
                ${e.direccion}
                <br>
                📏 ${e.distancia.toFixed(2)} km

                <br><br>

                <a href="${waze}" target="_blank">
                🚗 Ir con Waze
                </a>

                <br><br>

                <a href="${maps}" target="_blank">
                📍 Ir con Google Maps
                </a>

            `);



            marcadores.push(marcador);



            salida.innerHTML += `

            <div class="estacion">

                <h3>⛽ ${e.nombre}</h3>

                <p>${e.direccion}</p>

                <p>
                📏 ${e.distancia.toFixed(2)} km
                </p>

                <a href="${waze}" target="_blank">
                🚗 Waze
                </a>

                &nbsp;

                <a href="${maps}" target="_blank">
                📍 Maps
                </a>

            </div>

            `;


        });


    },

    function(){

        salida.innerHTML =
        "No se pudo obtener la ubicación.";

    });

}
