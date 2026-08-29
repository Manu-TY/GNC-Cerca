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


  const url =
    "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";


  try {

    const respuesta = await fetch(url);

    const datos = await respuesta.json();


    if (!datos.features) {

      resultado.innerHTML =
        "No se pudieron obtener las estaciones de ENARGAS.";

      return;
    }


    let estaciones = datos.features.map(e => {

      const a = e.attributes || {};


      // Datos oficiales de ENARGAS

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


      /*
       * Las coordenadas oficiales están en los campos
       * Latitud y Longitud.
       *
       * Usamos geometry solamente como respaldo.
       */

      let latEstacion = parseFloat(a.Latitud);
      let lonEstacion = parseFloat(a.Longitud);


      if (
        !Number.isFinite(latEstacion) ||
        !Number.isFinite(lonEstacion)
      ) {

        latEstacion = parseFloat(
          e.geometry?.y
        );

        lonEstacion = parseFloat(
          e.geometry?.x
        );
      }


      return {

        nombre: nombre.trim(),

        direccion:
          (direccion + " " + localidad + " " + provincia)
          .replace(/\s+/g, " ")
          .trim(),

        lat: latEstacion,

        lon: lonEstacion
      };

    });


    // Eliminamos registros sin coordenadas válidas

    estaciones = estaciones.filter(e =>
      Number.isFinite(e.lat) &&
      Number.isFinite(e.lon)
    );


    // Calculamos distancia

    estaciones.forEach(e => {

      e.distancia = distancia(
        lat,
        lon,
        e.lat,
        e.lon
      );

    });


    // Ordenamos de la más cercana a la más lejana

    estaciones.sort(
      (a, b) => a.distancia - b.distancia
    );


    resultado.innerHTML = "";


    // Mostramos las 10 más cercanas

    estaciones.slice(0, 10).forEach(e => {


      const waze =
        "https://waze.com/ul?ll=" +
        e.lat +
        "," +
        e.lon +
        "&navigate=yes";


      // Google Maps usando coordenadas

      const maps =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        e.lat +
        "," +
        e.lon;


      const marker =
        L.marker([e.lat, e.lon])
          .addTo(mapa);


      marker.bindPopup(`

        <b>${e.nombre}</b><br>

        ${e.direccion}<br>

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


      resultado.innerHTML += `

        <div class="estacion">

          <h3>⛽ ${e.nombre}</h3>

          <p>${e.direccion}</p>

          <p>
            📏 ${e.distancia.toFixed(2)} km
          </p>

          <a
            target="_blank"
            href="${waze}">
            🚗 Waze
          </a>

          &nbsp;

          <a
            target="_blank"
            href="${maps}">
            📍 Google Maps
          </a>

        </div>

      `;

    });


  } catch (error) {

    console.error(error);

    resultado.innerHTML =
      "Ocurrió un error al consultar ENARGAS.";

  }

}


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


async function buscarDestino() {

  const texto =
    document
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


  try {

    const respuesta =
      await fetch(url);


    const lugares =
      await respuesta.json();


    if (lugares.length === 0) {

      alert(
        "No encontré esa dirección."
      );

      return;
    }


    cargarEstaciones(

      parseFloat(lugares[0].lat),

      parseFloat(lugares[0].lon)

    );


  } catch (error) {

    console.error(error);

    alert(
      "No se pudo buscar la dirección."
    );

  }

}
