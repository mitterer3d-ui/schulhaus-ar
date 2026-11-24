# AR-Bauanleitung „Schulhaus HTL“ – HTL Wolfsberg

Web-App für das Handy: Kamera auf den leeren Kit-Card-Rahmen richten – die Teile fliegen Schritt für Schritt
von ihrem Platz am Rahmen an ihre Position im Haus.

**App öffnen:** `https://<benutzername>.github.io/<repository>/`

## Bedienung
1. Leeren Rahmen flach hinlegen, beide quadratischen Muster im Etikettenfeld sichtbar.
2. **AR STARTEN** → Kamera erlauben → auf den Rahmen richten.
3. Mit **WEITER** durch die Schritte, ↻ wiederholt die Animation. Ohne Kamera: **3D-ANSICHT**.

## Parameter in der Adresse
- Die Brennweite der Handykamera wird automatisch gemessen. Nur falls nötig fest vorgeben: `?f=0.7` … `?f=0.9`
- `?mode=3d` – direkt die 3D-Ansicht
- `?step=3` – bei Schritt 3 beginnen

## Technik
- Tracking: ArUco-Marker (MIP 36h12, ID 7 links, ID 11 rechts, 24 mm) mit js-aruco2 (MIT)
- Pose: alle Markerecken gemeinsam (Homographie + Gauss-Newton, `pose.js`), One-Euro-Filter gegen Zittern
- 3D: three.js (MIT), Modell in `model.js`, Platzierungen in `schulhaus.json`
- Reine statische Seite – läuft auf GitHub Pages, jedem https-Webserver oder lokal mit `python3 -m http.server`
- Die Kamera funktioniert nur über **https** (oder localhost).
