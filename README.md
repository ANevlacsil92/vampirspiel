# Vampirspiel

Koordinationstool für das Nachtgeländespiel: Suchgruppen sammeln Strohhalme
("Zähne") von versteckten Vampiren, Dracula nimmt sie wieder ab. Ersetzt die
WhatsApp-Gruppe, in der sonst jeder Vampir jeden Fund durchgibt.

Nuxt 4 im SPA-Modus, WebSocket über Nitro, Spielstand als Event-Log auf Disk.
Keine Datenbank, kein zweites Backend.

## Rollen

**Vampir** meldet sich mit seiner Strohhalmfarbe an und sieht die Gruppen als
große Buttons. Ein Tap gibt der Gruppe seinen Zahn. Falls er danebengetippt hat:
"Zurücknehmen" direkt in der Zeile, plus 8 Sekunden lang ein Rückgängig-Button.
Ein Vampir kann nur seine eigene Farbe vergeben – das erzwingt der Server, nicht
nur die Oberfläche.

**Dracula** sieht alle Gruppen mit ihrer kompletten Zahnleiste und dem Stand
(z.B. 7/11). Tippt er eine Gruppe an, bekommt er deren Farben als Chips und
wählt aus, was er physisch einsteckt. Das spiegelt genau, was er in der Hand
hält. Auch hier 10 Sekunden Rückgängig.

**Spielleitung** legt Gruppen und Farben an, startet und beendet, kann einzelne
Vampire deaktivieren (dann zählen sie nicht mehr für den Sieg) und die Zähne für
eine neue Runde zurücksetzen.

Dracula und Spielleitung hängen hinter einer PIN, damit ein Kind mit dem Handy
in der Hand nicht das Spiel umbaut.

## Lokal starten

```bash
docker compose up --build
```

Baut das Image und startet es auf http://localhost:3000. Ohne `.env` greifen die
Defaults aus der Compose-Datei (Port 3000, PIN 1897 für Dracula, 0666 für die
Spielleitung). Für andere Werte `.env.example` nach `.env` kopieren.

Der Spielstand liegt im Named Volume `vampirspiel-data` und überlebt
`docker compose down`. Zum kompletten Zurücksetzen `docker compose down -v`.

## Auf den Server

```bash
docker build -t registry.example.com/vampirspiel:latest .
docker push registry.example.com/vampirspiel:latest
```

Auf dem Server `.env` anlegen, dort `IMAGE=registry.example.com/vampirspiel:latest`
setzen, in `docker-compose.yml` die Zeile `build: .` auskommentieren, dann:

```bash
docker compose up -d
```

### Hinter nginx

Der WebSocket braucht die Upgrade-Header, sonst verbindet sich kein Client:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

`proxy_read_timeout` hochsetzen: zwischen zwei Funden können leicht 20 Minuten
liegen, und der Client-Ping alle 20 s soll die Verbindung halten, nicht der
Default von 60 s sie kappen.

## Spielstand

Jede Aktion landet als Zeile in `/data/events.jsonl` (Docker-Volume). Beim Start
spielt der Server das Log ab. Ein Neustart mitten im Spiel kostet also nichts,
und nach dem Abend kannst du nachlesen, wer wann was verteilt hat.

Für einen neuen Spielabend reicht "Zähne zurücksetzen" in der Spielleitung. Wenn
du das Log wirklich loswerden willst, die Datei im Volume löschen.

## Ausfallsicherheit im Wald

Jede Aktion bekommt am Client eine UUID und landet in einer Queue im
localStorage. Ist gerade kein Netz da, zeigt die Oberfläche den Tap trotzdem
sofort an und schickt ihn nach, sobald die Verbindung steht. Der Server
ignoriert bereits gesehene UUIDs – dreimal tippen, weil nichts passiert,
erzeugt also keine drei Zähne.

Die Rollenwahl bleibt am Handy gespeichert. Wer die App neu lädt, ist sofort
wieder drin.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # End-to-End gegen den gebauten Server
npm run test:restart # prüft Event-Log-Replay über einen Neustart
```

`npm test` baut nicht selbst – vorher `npm run build`.

## Lockfile

`package-lock.json` muss die Bindings **aller** Plattformen enthalten, nicht nur
der Maschine, auf der es entstanden ist. Sonst findet der Docker-Build auf
Alpine (musl) das passende `@rolldown/binding-*` nicht und bricht mit
"Cannot find native binding" ab.

Das ist ein bekannter npm-Bug (npm/cli#4828). Zwei Fallen dabei:
`npm install --package-lock-only` schreibt nur die Bindings der eigenen
Plattform, und `--legacy-peer-deps` erzeugt ein in sich inkonsistentes Lockfile.

Beim Aktualisieren von Abhängigkeiten deshalb mit **npm 12 oder neuer** und
ohne diese Flags arbeiten:

```bash
rm -rf node_modules package-lock.json
npm install
grep -c '"node_modules/@rolldown/binding-' package-lock.json   # muss 15 sein
```

## Was noch offen ist

- `docker build` und `docker compose up` sind **nicht** ausgeführt worden; in der
  Entwicklungsumgebung war kein Docker verfügbar. Einzeln geprüft sind die
  beiden Schritte, an denen es erfahrungsgemäß scheitert: `npm ci` läuft mit
  nur `package.json` und `package-lock.json` im Verzeichnis sauber durch
  (inklusive `nuxt prepare` als postinstall), und das gebaute `.output` startet
  ohne `node_modules`.
- Die Oberfläche ist nie auf einem echten Handy im Dunkeln getestet worden.
  Touch-Größen und Kontraste sind auf Papier richtig gewählt, aber ein
  Trockenlauf im Hof vor dem Spielabend ist trotzdem eine gute Idee.
- Kein Rate-Limit. Wer die PIN hat, kann beliebig viel drücken.
