# The Seven Paths – spielbarer Web-Prototyp

Ein teilbarer Einzelspieler-Mockup für die ersten GDD-Regeln. Er ist vom Unity-Steam-Spiel getrennt und simuliert keine Koop-Verbindung.

Öffentliche Spieladresse: https://ansarbi006.github.io/the-seven-paths-preview/

Die Datei `index.html` nicht per `file://` öffnen: Three.js wird als Web-Modul geladen und braucht einen Webserver. Die öffentliche Adresse oben funktioniert ohne lokale Installation.

## Spielen

```bash
npm install
npm run dev
```

Im Browser die angezeigte lokale Adresse öffnen. Desktop mit Tastatur und Maus empfohlen.

- Erkundung: in die begehbare 3D-Welt klicken; der Bogenschütze läuft zum angeklickten Ort und die Kamera folgt. Die Minimap oben rechts zeigt seine Position live und erlaubt Routenwahl. Die goldenen Tore auf den Wegen markieren Feldübergänge. Erst beim Überqueren eines Tores kostet der Wechsel einen Reisepunkt; innerhalb eines Felds ist Bewegung frei.
- Schlafen: nur in gegnerfreien Feldern. Die Horde zieht nachts einen Schritt, Reisepunkte werden auf sieben gesetzt.
- Kampf: WASD, Maus, Linksklick, Leertaste. Der Schuss unmittelbar nach einer Rolle streut.
- Ziel: Silberblatt am Flussufer finden, Wächter am Wachturm besiegen, Burg bewahren.

`npm test` prüft die zentralen Regeln; `npm run build` erstellt die statische Web-Version in `docs/` für GitHub Pages.

## Umfang und Quellen

Die illustrierte Minimap `public/assets/seven-paths-map.png` wurde für dieses Projekt mit der integrierten Bildgenerierung erstellt. Prompt: „Overhead/three-quarter stylized fantasy landscape map plate; castle, forest, swamp, old ruins, river crossing, village, watchtower and dark mountain pass; handcrafted miniature-board-game aesthetic; no text, labels, grid, icons or UI.“ Die begehbare 3D-Welt und ihre acht Orte sind als Three.js-Geometrie umgesetzt; Minimap-Koordinaten und 3D-Orte verwenden dieselbe Datenquelle.

Welt und Kampf nutzen bewusst einfache, selbst programmierte 3D-Formen. Es wurden keine fremden 3D-Assets importiert. Das spart Lizenzunsicherheit und macht den ersten Spielfluss direkt testbar. Visuell ist dies weiterhin ein Prototyp. Echte Steam-Lobbys, Mehrspieler, Handel und die vier Klassen gehören zum Unity-Spiel, nicht zu diesem Web-Mockup.
