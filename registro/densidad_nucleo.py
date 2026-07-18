# densidad_nucleo.py — ¿resuelve Gaia el núcleo de M13?
import numpy as np, requests
RA, DEC = 250.4235, 36.4613
adql = (f'SELECT ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source '
        f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{RA},{DEC},0.06)) "
        f"AND phot_g_mean_mag IS NOT NULL")
d = requests.get("https://gea.esac.esa.int/tap-server/tap/sync",
    params={"request":"doQuery","lang":"adql","format":"json","query":adql}).json()["data"]
g = np.array([r[2] for r in d]); ra = np.array([r[0] for r in d]); dec = np.array([r[1] for r in d])
sep = np.hypot((ra-RA)*np.cos(np.radians(DEC)), dec-DEC)*3600  # arcsec

print(f"total en 3.6': {len(g)}")
for rmax, nom in [(48,'core ~0.8\''),(150,'medio'),(216,'todo')]:
    m = sep < rmax
    print(f"\n{nom} (r<{rmax}\"): {m.sum()} estrellas, {m.sum()/(np.pi*(rmax/60)**2):.0f}/arcmin²")
    if m.sum():
        print(f"  G: min={g[m].min():.1f} mediana={np.median(g[m]):.1f} "
              f"p90={np.percentile(g[m],90):.1f} max={g[m].max():.1f}")
# histograma de completitud: dónde deja Gaia de contar
h, _ = np.histogram(g, bins=np.arange(10,22))
print("\nconteo por magnitud G (10→21):", h)
print("→ el pico y caída indican el límite de completitud")