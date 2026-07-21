/* ===========================================================================
 * BITÁCORA ESTELAR · Catálogo de ESTRELLAS DE CARBONO
 * ---------------------------------------------------------------------------
 * Base de datos de las estrellas de carbono del programa de observación de la
 * Astronomical League (AL Carbon Star Observing Program). Es la versión
 * "consultable" (JavaScript) de la fuente de verdad en
 *   mapa/datos/AL_Carbon_Stars.csv
 * generada con scripts/gen_carbono.py. NO editar a mano: regenerar desde el CSV.
 *
 * Cada objeto:
 *   id           identificador único (designación original del catálogo)
 *   nombre       nombre para mostrar (designación + constelación)
 *   constelacion nombre completo de la constelación (latín)
 *   abrev        abreviatura de la constelación (3 letras)
 *   ra, dec      coordenadas J2000 en "HH MM SS" / "±DD MM SS" (formato del simulador)
 *   mag          magnitud visual aproximada (muchas son variables)
 *   tipo         etiquetas legibles: carbono · variable · doble
 *
 * Las estrellas de carbono destacan por su intensísimo color rojo-anaranjado
 * (hollín de carbono en su atmósfera que filtra el azul); se aprecian mejor en
 * la vista de "Estrellas de Gaia (color real)" del simulador de ocular.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */
(function () {
  'use strict';
  window.BITACORA_CARBONO = [
  { id: "TW OPH", nombre: "TW Oph", constelacion: "Ophiuchus", abrev: "Oph", ra: "17 29 44", dec: "-19 28 18", mag: 8.2, tipo: "carbono · variable" },
  { id: "SAO 46574", nombre: "SAO 46574", constelacion: "Hercules", abrev: "Her", ra: "17 13 31", dec: "+42 06 18", mag: 7.6, tipo: "carbono" },
  { id: "SZ SGR", nombre: "SZ Sgr", constelacion: "Sagittarius", abrev: "Sgr", ra: "17 44 56", dec: "-18 39 24", mag: 8.6, tipo: "carbono · doble" },
  { id: "T DRA", nombre: "T Dra", constelacion: "Draco", abrev: "Dra", ra: "17 56 23", dec: "+58 13 06", mag: 12.5, tipo: "carbono · doble" },
  { id: "FO SER", nombre: "FO Ser", constelacion: "Serpens", abrev: "Ser", ra: "18 19 22", dec: "-15 36 42", mag: 8.5, tipo: "carbono · variable" },
  { id: "AC HER", nombre: "AC Her", constelacion: "Hercules", abrev: "Her", ra: "18 30 16", dec: "+21 52 00", mag: 7.6, tipo: "variable" },
  { id: "T LYR", nombre: "T Lyr", constelacion: "Lyra", abrev: "Lyr", ra: "18 32 20", dec: "+36 59 54", mag: 8.0, tipo: "carbono · variable" },
  { id: "HK LYR", nombre: "HK Lyr", constelacion: "Lyra", abrev: "Lyr", ra: "18 42 50", dec: "+36 57 30", mag: 7.7, tipo: "carbono · variable" },
  { id: "S SCT", nombre: "S Sct", constelacion: "Scutum", abrev: "Sct", ra: "18 50 20", dec: "-07 54 24", mag: 6.8, tipo: "carbono · doble" },
  { id: "UV AQL", nombre: "UV Aql", constelacion: "Aquila", abrev: "Aql", ra: "18 58 32", dec: "+14 21 48", mag: 8.4, tipo: "carbono · variable" },
  { id: "V AQL", nombre: "V Aql", constelacion: "Aquila", abrev: "Aql", ra: "19 04 24", dec: "-05 41 00", mag: 6.8, tipo: "carbono · doble" },
  { id: "V1942 SGR", nombre: "V1942 Sgr", constelacion: "Sagittarius", abrev: "Sgr", ra: "19 19 10", dec: "-15 54 30", mag: 6.9, tipo: "carbono · variable" },
  { id: "U LYR", nombre: "U Lyr", constelacion: "Lyra", abrev: "Lyr", ra: "19 20 09", dec: "+37 52 36", mag: 8.3, tipo: "carbono · doble" },
  { id: "UX DRA", nombre: "UX Dra", constelacion: "Draco", abrev: "Dra", ra: "19 21 36", dec: "+76 33 30", mag: 6.2, tipo: "carbono · variable" },
  { id: "SAO 162551", nombre: "SAO 162551", constelacion: "Aquila", abrev: "Aql", ra: "19 23 10", dec: "-10 42 06", mag: 7.0, tipo: "carbono · variable" },
  { id: "AW CYG", nombre: "AW Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "19 28 48", dec: "+46 02 36", mag: 11.0, tipo: "carbono · variable" },
  { id: "AQ SGR", nombre: "AQ Sgr", constelacion: "Sagittarius", abrev: "Sgr", ra: "19 34 19", dec: "-16 22 24", mag: 7.0, tipo: "carbono · variable" },
  { id: "TT CYG", nombre: "TT Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "19 40 57", dec: "+32 37 00", mag: 10.7, tipo: "carbono · doble" },
  { id: "AX CYG", nombre: "AX Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "19 57 13", dec: "+44 15 36", mag: 7.8, tipo: "carbono · doble" },
  { id: "V1469 AQL", nombre: "V1469 Aql", constelacion: "Aquila", abrev: "Aql", ra: "20 01 04", dec: "+09 30 48", mag: 8.4, tipo: "carbono · doble" },
  { id: "BF SGE", nombre: "BF Sge", constelacion: "Sagitta", abrev: "Sge", ra: "20 02 23", dec: "+21 05 24", mag: 10.3, tipo: "carbono · variable" },
  { id: "X SGE", nombre: "X Sge", constelacion: "Sagitta", abrev: "Sge", ra: "20 05 05", dec: "+20 38 48", mag: 8.4, tipo: "carbono · doble" },
  { id: "SV CYG", nombre: "SV Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 09 30", dec: "+47 52 12", mag: 8.6, tipo: "carbono · doble" },
  { id: "RY CYG", nombre: "RY Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 10 23", dec: "+35 56 48", mag: 9.1, tipo: "carbono · variable" },
  { id: "RS CYG", nombre: "RS Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 13 24", dec: "+38 43 42", mag: 7.7, tipo: "carbono · doble" },
  { id: "RT CAP", nombre: "RT Cap", constelacion: "Capricornus", abrev: "Cap", ra: "20 17 07", dec: "-21 19 00", mag: 7.2, tipo: "carbono · doble" },
  { id: "U CYG", nombre: "U Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 19 37", dec: "+47 53 36", mag: 8.8, tipo: "carbono · doble" },
  { id: "V CYG", nombre: "V Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 41 18", dec: "+48 08 24", mag: 7.7, tipo: "carbono · variable" },
  { id: "CY CYG", nombre: "CY Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "20 46 50", dec: "+46 03 06", mag: 8.3, tipo: "variable" },
  { id: "SAO 106516", nombre: "SAO 106516", constelacion: "Delphinus", abrev: "Del", ra: "20 48 37", dec: "+17 50 18", mag: 8.1, tipo: "carbono · doble" },
  { id: "SAO 89499", nombre: "SAO 89499", constelacion: "Vulpecula", abrev: "Vul", ra: "21 09 59", dec: "+26 36 54", mag: 8.1, tipo: "carbono · doble" },
  { id: "S CEP", nombre: "S Cep", constelacion: "Cepheus", abrev: "Cep", ra: "21 35 13", dec: "+78 37 24", mag: 7.4, tipo: "carbono · variable" },
  { id: "V460 CYG", nombre: "V460 Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "21 42 01", dec: "+35 30 36", mag: 6.0, tipo: "carbono · variable" },
  { id: "RV CYG", nombre: "RV Cyg", constelacion: "Cygnus", abrev: "Cyg", ra: "21 43 16", dec: "+38 01 00", mag: 10.8, tipo: "carbono · doble" },
  { id: "RX PEG", nombre: "RX Peg", constelacion: "Pegasus", abrev: "Peg", ra: "21 56 22", dec: "+22 51 36", mag: 8.1, tipo: "carbono · variable" },
  { id: "RZ PEG", nombre: "RZ Peg", constelacion: "Pegasus", abrev: "Peg", ra: "22 05 53", dec: "+33 30 24", mag: 9.2, tipo: "carbono · variable" },
  { id: "RU AQR", nombre: "RU Aqr", constelacion: "Aquarius", abrev: "Aqr", ra: "23 24 24", dec: "-17 19 06", mag: 9.3, tipo: "variable" },
  { id: "ST AND", nombre: "ST And", constelacion: "Andromeda", abrev: "And", ra: "23 38 45", dec: "+35 46 18", mag: 7.7, tipo: "carbono · variable" },
  { id: "TX PSC", nombre: "TX Psc", constelacion: "Pisces", abrev: "Psc", ra: "23 46 24", dec: "+03 29 12", mag: 5.0, tipo: "carbono · variable" },
  { id: "SAO 128396", nombre: "SAO 128396", constelacion: "Pisces", abrev: "Psc", ra: "23 49 05", dec: "+06 22 54", mag: 8.5, tipo: "carbono" },
  { id: "WZ CASS", nombre: "WZ Cas", constelacion: "Cassiopeia", abrev: "Cas", ra: "00 01 16", dec: "+60 21 18", mag: 7.1, tipo: "carbono · doble" },
  { id: "SU AND", nombre: "SU And", constelacion: "Andromeda", abrev: "And", ra: "00 04 36", dec: "+43 33 00", mag: 8.1, tipo: "carbono · variable" },
  { id: "SAO 109003", nombre: "SAO 109003", constelacion: "Pisces", abrev: "Psc", ra: "00 05 22", dec: "+08 47 12", mag: 8.2, tipo: "estrella" },
  { id: "VX AND", nombre: "VX And", constelacion: "Andromeda", abrev: "And", ra: "00 19 54", dec: "+44 42 30", mag: 8.5, tipo: "carbono · variable" },
  { id: "AQ AND", nombre: "AQ And", constelacion: "Andromeda", abrev: "And", ra: "00 27 32", dec: "+35 35 12", mag: 7.8, tipo: "carbono · variable" },
  { id: "SAO74353", nombre: "SAO74353", constelacion: "Andromeda", abrev: "And", ra: "00 54 14", dec: "+24 04 00", mag: 8.5, tipo: "carbono · doble" },
  { id: "W CAS", nombre: "W Cas", constelacion: "Cassiopeia", abrev: "Cas", ra: "00 54 54", dec: "+58 33 48", mag: 7.8, tipo: "carbono · variable" },
  { id: "Z PSC", nombre: "Z Psc", constelacion: "Pisces", abrev: "Psc", ra: "01 16 05", dec: "+25 46 06", mag: 6.8, tipo: "carbono · variable" },
  { id: "V ARI", nombre: "V Ari", constelacion: "Aries", abrev: "Ari", ra: "02 15 00", dec: "+12 14 18", mag: 8.5, tipo: "carbono · variable" },
  { id: "SAO 129989", nombre: "SAO 129989", constelacion: "Cetus", abrev: "Cet", ra: "02 35 07", dec: "-09 26 30", mag: 8.2, tipo: "carbono" },
  { id: "UY AND", nombre: "UY And", constelacion: "Andromeda", abrev: "And", ra: "02 38 24", dec: "+39 10 06", mag: 7.4, tipo: "carbono · variable" },
  { id: "SAO 23858", nombre: "SAO 23858", constelacion: "Cassiopeia", abrev: "Cas", ra: "03 11 25", dec: "+57 54 06", mag: 7.6, tipo: "carbono · variable" },
  { id: "Y PER", nombre: "Y Per", constelacion: "Perseus", abrev: "Per", ra: "03 27 42", dec: "+44 10 36", mag: 9.8, tipo: "carbono · variable" },
  { id: "V466 PER", nombre: "V466 Per", constelacion: "Perseus", abrev: "Per", ra: "03 41 30", dec: "+51 30 06", mag: 8.1, tipo: "carbono · variable" },
  { id: "U CAM", nombre: "U Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "03 41 48", dec: "+62 38 54", mag: 7.3, tipo: "carbono · doble" },
  { id: "UV CAM", nombre: "UV Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "04 05 54", dec: "+61 47 36", mag: 7.6, tipo: "carbono · variable" },
  { id: "XX CAM", nombre: "XX Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "04 08 39", dec: "+53 21 36", mag: 7.3, tipo: "variable" },
  { id: "ST CAM", nombre: "ST Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "04 51 13", dec: "+68 10 06", mag: 10.0, tipo: "carbono · variable" },
  { id: "TT TAU", nombre: "TT Tau", constelacion: "Taurus", abrev: "Tau", ra: "04 51 31", dec: "+28 31 36", mag: 7.9, tipo: "carbono · variable" },
  { id: "R LEP", nombre: "R Lep", constelacion: "Lepus", abrev: "Lep", ra: "04 59 36", dec: "-14 48 18", mag: 8.1, tipo: "carbono · variable" },
  { id: "EL AUR", nombre: "EL Aur", constelacion: "Auriga", abrev: "Aur", ra: "05 03 23", dec: "+50 38 00", mag: 11.5, tipo: "carbono · variable" },
  { id: "W ORI", nombre: "W Ori", constelacion: "Orion", abrev: "Ori", ra: "05 05 24", dec: "+01 10 36", mag: 5.9, tipo: "carbono · variable" },
  { id: "TX AUR", nombre: "TX Aur", constelacion: "Auriga", abrev: "Aur", ra: "05 09 05", dec: "+39 00 06", mag: 9.1, tipo: "carbono · variable" },
  { id: "SY ERI", nombre: "SY Eri", constelacion: "Eridanus", abrev: "Eri", ra: "05 09 48", dec: "-05 30 54", mag: 8.3, tipo: "carbono · variable" },
  { id: "UV AUR", nombre: "UV Aur", constelacion: "Auriga", abrev: "Aur", ra: "05 21 49", dec: "+32 30 42", mag: 9.6, tipo: "carbono · doble" },
  { id: "S AUR", nombre: "S Aur", constelacion: "Auriga", abrev: "Aur", ra: "05 27 07", dec: "+34 09 00", mag: 10.3, tipo: "carbono · doble" },
  { id: "RT ORI", nombre: "RT Ori", constelacion: "Orion", abrev: "Ori", ra: "05 33 14", dec: "+07 09 12", mag: 8.0, tipo: "carbono · variable" },
  { id: "S CAM", nombre: "S Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "05 41 02", dec: "+68 47 54", mag: 9.0, tipo: "carbono · variable" },
  { id: "TU TAU", nombre: "TU Tau", constelacion: "Taurus", abrev: "Tau", ra: "05 45 14", dec: "+24 25 12", mag: 8.5, tipo: "carbono · doble" },
  { id: "Y TAU", nombre: "Y Tau", constelacion: "Taurus", abrev: "Tau", ra: "05 45 39", dec: "+20 41 42", mag: 6.8, tipo: "carbono · variable" },
  { id: "FU AUR", nombre: "FU Aur", constelacion: "Auriga", abrev: "Aur", ra: "05 48 08", dec: "+30 37 48", mag: 8.4, tipo: "carbono · variable" },
  { id: "TU GEM", nombre: "TU Gem", constelacion: "Gemini", abrev: "Gem", ra: "06 10 53", dec: "+26 00 48", mag: 7.4, tipo: "carbono · variable" },
  { id: "FU MON", nombre: "FU Mon", constelacion: "Monoceros", abrev: "Mon", ra: "06 22 24", dec: "+03 25 24", mag: 8.9, tipo: "carbono · variable" },
  { id: "V AUR", nombre: "V Aur", constelacion: "Auriga", abrev: "Aur", ra: "06 24 02", dec: "+47 42 18", mag: 8.5, tipo: "carbono · variable" },
  { id: "BL ORI", nombre: "BL Ori", constelacion: "Orion", abrev: "Ori", ra: "06 25 28", dec: "+14 43 18", mag: 6.3, tipo: "carbono · variable" },
  { id: "UU AUR", nombre: "UU Aur", constelacion: "Auriga", abrev: "Aur", ra: "06 36 33", dec: "+38 26 42", mag: 5.5, tipo: "carbono · doble" },
  { id: "VW GEM", nombre: "VW Gem", constelacion: "Gemini", abrev: "Gem", ra: "06 42 09", dec: "+31 27 12", mag: 8.2, tipo: "carbono · variable" },
  { id: "GY MON", nombre: "GY Mon", constelacion: "Monoceros", abrev: "Mon", ra: "06 53 11", dec: "-04 34 30", mag: 8.2, tipo: "carbono · variable" },
  { id: "RV MON", nombre: "RV Mon", constelacion: "Monoceros", abrev: "Mon", ra: "06 58 21", dec: "+06 10 00", mag: 7.5, tipo: "carbono · variable" },
  { id: "V614 MON", nombre: "V614 Mon", constelacion: "Monoceros", abrev: "Mon", ra: "07 01 02", dec: "-03 15 06", mag: 7.3, tipo: "carbono · variable" },
  { id: "RY MON", nombre: "RY Mon", constelacion: "Monoceros", abrev: "Mon", ra: "07 06 56", dec: "-07 33 24", mag: 7.9, tipo: "carbono · variable" },
  { id: "W CMA", nombre: "W CMa", constelacion: "Canis Major", abrev: "CMa", ra: "07 08 03", dec: "-11 55 18", mag: 6.7, tipo: "carbono · variable" },
  { id: "R CMA", nombre: "R CMa", constelacion: "Canis Major", abrev: "CMa", ra: "07 19 28", dec: "-16 23 42", mag: 5.7, tipo: "doble" },
  { id: "BM GEM", nombre: "BM Gem", constelacion: "Gemini", abrev: "Gem", ra: "07 20 59", dec: "+25 00 00", mag: 10.9, tipo: "carbono · variable" },
  { id: "RU CAM", nombre: "RU Cam", constelacion: "Camelopardalis", abrev: "Cam", ra: "07 21 44", dec: "+69 40 12", mag: 8.5, tipo: "carbono · variable" },
  { id: "NQ GEM", nombre: "NQ Gem", constelacion: "Gemini", abrev: "Gem", ra: "07 31 55", dec: "+24 30 12", mag: 8.0, tipo: "carbono · doble" },
  { id: "RU PUP", nombre: "RU Pup", constelacion: "Puppis", abrev: "Pup", ra: "08 07 30", dec: "-22 54 42", mag: 8.4, tipo: "carbono · variable" },
  { id: "X CNC", nombre: "X Cnc", constelacion: "Cancer", abrev: "Cnc", ra: "08 55 23", dec: "+17 13 48", mag: 6.2, tipo: "carbono · variable" },
  { id: "T CNC", nombre: "T Cnc", constelacion: "Cancer", abrev: "Cnc", ra: "08 56 40", dec: "+19 50 54", mag: 8.5, tipo: "carbono · doble" },
  { id: "Y HYA", nombre: "Y Hya", constelacion: "Hydra", abrev: "Hya", ra: "09 51 04", dec: "-23 01 00", mag: 6.7, tipo: "carbono · variable" },
  { id: "U HYA", nombre: "U Hya", constelacion: "Hydra", abrev: "Hya", ra: "10 37 33", dec: "-13 23 00", mag: 4.9, tipo: "carbono · variable" },
  { id: "VY UMA", nombre: "VY UMa", constelacion: "Ursa Major", abrev: "UMa", ra: "10 45 04", dec: "+67 24 36", mag: 6.0, tipo: "carbono · variable" },
  { id: "V HYA", nombre: "V Hya", constelacion: "Hydra", abrev: "Hya", ra: "10 51 37", dec: "-21 15 00", mag: 9.7, tipo: "carbono · doble" },
  { id: "SS VIR", nombre: "SS Vir", constelacion: "Virgo", abrev: "Vir", ra: "12 25 14", dec: "+00 46 06", mag: 7.3, tipo: "carbono · variable" },
  { id: "Y CVN", nombre: "Y CVn", constelacion: "Canes Venatici", abrev: "CVn", ra: "12 45 08", dec: "+45 26 24", mag: 5.3, tipo: "carbono · variable" },
  { id: "RY DRA", nombre: "RY Dra", constelacion: "Draco", abrev: "Dra", ra: "12 56 26", dec: "+65 59 36", mag: 6.5, tipo: "carbono · variable" },
  { id: "SAO 157721", nombre: "SAO 157721", constelacion: "Virgo", abrev: "Vir", ra: "13 06 25", dec: "-20 03 30", mag: 8.4, tipo: "carbono" },
  { id: "V CRB", nombre: "V CrB", constelacion: "Corona Borealis", abrev: "CrB", ra: "15 49 31", dec: "+39 34 12", mag: 9.3, tipo: "carbono · variable" },
  { id: "RR HER", nombre: "RR Her", constelacion: "Hercules", abrev: "Her", ra: "16 04 13", dec: "+50 29 54", mag: 11.5, tipo: "carbono · variable" },
  { id: "V OPH", nombre: "V Oph", constelacion: "Ophiuchus", abrev: "Oph", ra: "16 26 44", dec: "-12 25 30", mag: 8.9, tipo: "carbono · variable" }
  ];
})();
