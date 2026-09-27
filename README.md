# The Seven Paths – spielbarer Web-Prototyp

Ein lokaler Einzelspieler-Mockup für die ersten GDD-Regeln. Er ist vom Unity-Steam-Spiel getrennt und simuliert keine Koop-Verbindung.

## Spielen

```bash
npm install
npm run dev
```

Im Browser die angezeigte lokale Adresse öffnen. Desktop mit Tastatur und Maus empfohlen.

- Karte: angrenzende Feldmarker anklicken. Jeder Übergang kostet einen Reisepunkt. Klicks nahe dem aktuellen Feld bewegen den Marker kostenlos darin.
- Schlafen: nur in gegnerfreien Feldern. Die Horde zieht nachts einen Schritt, Reisepunkte werden auf sieben gesetzt.
- Kampf: WASD, Maus, Linksklick, Leertaste. Der Schuss unmittelbar nach einer Rolle streut.
- Ziel: Silberblatt am Flussufer finden, Wächter am Wachturm besiegen, Burg bewahren.

`npm test` prüft die zentralen Regeln; `npm run build` erstellt die statische Web-Version in `docs/` für GitHub Pages.

## Umfang und Quellen

Die illustrierte Karte `public/assets/seven-paths-map.png` wurde für dieses Projekt mit der integrierten Bildgenerierung erstellt. Prompt: „Overhead/three-quarter stylized fantasy landscape map plate; castle, forest, swamp, old ruins, river crossing, village, watchtower and dark mountain pass; handcrafted miniature-board-game aesthetic; no text, labels, grid, icons or UI.“ Die Feldmarker und Reiseregeln sind separat als Spielcode umgesetzt.

Der Kampf nutzt bewusst einfache, selbst programmierte 3D-Formen. Es wurden keine fremden 3D-Assets importiert. Das spart Lizenzunsicherheit und macht den ersten Spielfluss direkt testbar. Visuell ist die Kampfszene ein Prototyp. Echte Steam-Lobbys, Mehrspieler, Handel und die vier Klassen gehören zum Unity-Spiel, nicht zu diesem Web-Mockup.
