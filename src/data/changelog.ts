/** Versionsverlauf für das Hauptmenü (neueste zuerst). */
export type ChangeKind = 'neu' | 'besser' | 'fix';

export interface ChangeGroup {
  title: string;
  items: { kind: ChangeKind; text: string }[];
}

export interface Release {
  version: string;
  date: string;
  name: string;
  groups: ChangeGroup[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.4.1',
    date: '19.10.2026',
    name: 'Talentbaum, Häuser und übersichtliches Inventar',
    groups: [
      {
        title: 'Talentbaum',
        items: [
          { kind: 'neu', text: 'Charakterstufe 1–20: Jede Stufe gibt Talentpunkte (alle 5 Stufen 2 Bonuspunkte). Im Reiter Person → Talente schaltest du sie in sechs Berufszweigen frei (Tischler, Mechaniker, Sanitäter, Schneider, Kämpfer, Überlebender).' },
          { kind: 'neu', text: 'Herstellen und Bauen zeigt nur Rezepte, die du kennst: Grundrezepte und alles, was du im Talentbaum freigeschaltet hast. Alles außer den Grundrezepten stellst du an einer Werkbank her.' },
          { kind: 'neu', text: 'Talente geben auch Vorteile: schnelleres Bauen, bessere Autoreparatur, flinkere Behandlung, mehr Nahkampfschaden und mehr Tragkraft.' },
          { kind: 'besser', text: 'Der Personen-Bereich rechts im Inventar ist aufgeräumt: eigene Reiter für Person, Skills, Talente, Körper und Gesundheit. Rezepte sind nach Gruppen sortiert.' },
        ],
      },
      {
        title: 'Häuser und Welt',
        items: [
          { kind: 'neu', text: 'Drei neue Wandarten (Rauputz, Klinker, Plattenbau) und Verschleiß an den Wänden: Graffiti, Risse, abgeplatzter Putz, Flecken, Einschüsse und Ruß. Manche Häuser sind gepflegt, andere verfallen; mehr kaputte Fenster.' },
          { kind: 'besser', text: 'Zwischen freistehenden Gebäuden bleibt immer eine Gasse von mindestens 3 m; es gibt mehr L-Häuser.' },
          { kind: 'besser', text: 'Fenster zeigen nicht mehr auf die Wand eines Nachbarhauses, auch nicht in schmalen Gassen.' },
          { kind: 'neu', text: 'Werkbank, Schlafen auf Betten und Sofas in Gebäuden, kein Regen im Haus und schnelleres Trocknen, geschlossene Regale und Schränke mit offener Tür.' },
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '19.10.2026',
    name: 'Straßen, Raststätten und Autos',
    groups: [
      {
        title: 'Straßen und Gehwege',
        items: [
          { kind: 'besser', text: 'Feiner Asphalt statt grober Pixelflecken, nahtlos über Kreuzungen und Chunk-Grenzen; Gehwegplatten werden nicht mehr gestreckt.' },
          { kind: 'besser', text: 'Markierungen mit abgeriebener Farbe: doppelte gelbe Mittellinie, Linien enden vor Zebrastreifen und Haltelinien, die Kreuzung bleibt frei.' },
          { kind: 'besser', text: 'Bordsteine mit Fase und Stoßfugen, davor eine Rinne aus Pflastersteinen; Kanaldeckel und Gullys mit echter Textur.' },
          { kind: 'neu', text: 'Jede Straße sieht anders aus: Reifenspuren in Abschnitten, Risse, Netzrisse, Bitumenverguss, kleine und große Schlaglöcher, Flicken, Bremsspuren, Ölflecken und Pfützen. Manche Abschnitte sind frisch saniert, andere kaputt.' },
          { kind: 'neu', text: 'Leitpfosten an den Landstraßen; Autobahn und Rampen haben den neuen Asphalt.' },
        ],
      },
      {
        title: 'Land',
        items: [
          { kind: 'neu', text: 'Schmale Nebenstraßen zweigen von den Landstraßen ab und enden an einem Wendeplatz, oft mit Bauernhaus, Auto oder Heu.' },
          { kind: 'neu', text: 'Raststätte an der Autobahn: Tankdach mit Zapfsäulen, Preismast, Shop, Lkw- und Pkw-Parkplätze, bepflanzte Inseln, Picknickwiese, Automaten.' },
          { kind: 'neu', text: 'Tankstellen an den Landstraßen; die Wald-Raststätten sind jetzt Wanderparkplätze mit Picknicklichtung.' },
          { kind: 'besser', text: 'Wiesen ohne sichtbares Kachelmuster, mit trockenen, satten und erdigen Stellen.' },
        ],
      },
      {
        title: 'Autos',
        items: [
          { kind: 'besser', text: 'Glänzender Lack mit Klarlack statt grau-stumpfer Farbe, abgerundete Bleche, neue Räder mit Felgen und Speichen, Schatten unter den Autos.' },
          { kind: 'besser', text: 'Geparkte Autos stehen in Fahrtrichtung ihres Fahrstreifens. Die Verformung beim Unfall rechnet schneller.' },
        ],
      },
      {
        title: 'Fehler',
        items: [
          { kind: 'fix', text: 'Fehlende Bordsteine an manchen Gehwegen und Kreuzungsecken.' },
          { kind: 'fix', text: 'Haltelinien lagen über der Mittellinie statt auf der zufahrenden Fahrbahn.' },
          { kind: 'fix', text: 'Regen machte den Autolack nicht nass; Gassen zeigten Fahrbahnlinien.' },
        ],
      },
    ],
  },
  {
    version: '0.3.9',
    date: '18.10.2026',
    name: 'Charakterstufe, Werkbank und neue Möbel',
    groups: [
      {
        title: 'Charakterstufe',
        items: [
          { kind: 'neu', text: 'Charakterstufe 1–20 im Person-Reiter: Erfahrung aus allen Fertigkeiten und aus dem Herstellen, mit XP-Balken und Hinweis auf das nächste Rezept.' },
          { kind: 'neu', text: '19 neue Rezepte (Waffen, Werkzeug, Kleidung, Rucksäcke, Medizin), die nach Stufe freigeschaltet werden. Gesperrte Rezepte sind ausgegraut.' },
          { kind: 'neu', text: 'Werkbank: Stufe-1-Rezepte gehen im Inventar, alles darüber nur an einer Werkbank in der Nähe.' },
        ],
      },
      {
        title: 'Welt',
        items: [
          { kind: 'neu', text: 'Auf Betten und Sofas in Gebäuden schlafen (E): die Zeit läuft dabei schneller.' },
          { kind: 'besser', text: 'Im Haus fällt kein Regen, und nasse Kleidung trocknet dort schneller.' },
          { kind: 'besser', text: 'Regale, Schränke und Kleiderschränke: geschlossene Varianten mit Türen, eine Tür steht offen; Kartons auf den Regalen.' },
          { kind: 'besser', text: 'Ausrüstungsfelder links und rechts der Figur im Inventar sind breiter.' },
        ],
      },
    ],
  },
  {
    version: '0.3.8',
    date: '18.10.2026',
    name: 'Waffen, Nachladen und Kleidung im Mehrspieler',
    groups: [
      {
        title: 'Waffen',
        items: [
          { kind: 'fix', text: 'Nachladen mit Wechselmagazin geht: R setzt ein Magazin aus dem Rucksack ein (die Restpatronen aus dem alten Magazin kommen lose zurück). Die Anzeige zeigt auch, wie viele Magazine du dabei hast.' },
          { kind: 'fix', text: 'Schusswaffen liegen richtig in der Hand: Arm gestreckt, Lauf nach vorn, Gewehre und Schrotflinten mit beiden Händen.' },
        ],
      },
      {
        title: 'Mehrspieler',
        items: [
          { kind: 'fix', text: 'Zieht ein Spieler den Pullover aus, hat das darunterliegende T-Shirt jetzt eine andere Farbe: Mitspieler sehen dadurch sofort, dass er ausgezogen ist.' },
        ],
      },
      {
        title: 'Anzeige',
        items: [
          { kind: 'besser', text: 'Die Munitionsanzeige steht jetzt ganz rechts, oberhalb von Blutung und Zuständen, statt in der Bildschirmmitte.' },
        ],
      },
    ],
  },
  {
    version: '0.3.7',
    date: '18.10.2026',
    name: 'Zuschlagen, ein Haus statt zwei, neue Gegenstände',
    groups: [
      {
        title: 'Neue Gegenstände',
        items: [
          { kind: 'neu', text: 'Viele neue Gegenstände nach dem Vorbild von Project Zomboid: Nahkampfwaffen wie Katana, Schwert, Speer, Streitkolben und verschiedene Messer, dazu Schusswaffen mit Magazin und Munition und Skillbücher. Sie tauchen als Beute auf.' },
        ],
      },
      {
        title: 'Häuser',
        items: [
          { kind: 'besser', text: 'L-Häuser sind ein einziges Haus: beide Flügel haben dieselbe Höhe, Fassade und Dachfarbe, innen verbindet ein breiter offener Durchgang statt einer Tür.' },
          { kind: 'besser', text: 'Wo Häuser Wand an Wand stehen (Reihenhäuser, L-Haus), gibt es auf der gemeinsamen Wand keine Fenster und keine Klimageräte.' },
          { kind: 'fix', text: 'Bilder hängen nicht mehr vor Fenstern.' },
        ],
      },
      {
        title: 'Hammer und Axt',
        items: [
          { kind: 'neu', text: 'Mit Hammer, Vorschlaghammer, Axt oder Brecheisen in der Hand wird das Ziel unter der Maus gelb umrandet (Wandabschnitt, Möbel, gebautes Teil, Tür, Fensterbarrikade).' },
          { kind: 'neu', text: 'Linksklick schlägt zu: An der Stelle, an die du schlägst, entsteht ein Loch, das mit jedem Schlag wächst. Nach 6 Schlägen ist ein Wandabschnitt kaputt, lange Abschnitte nach 7 oder 8. Möbel brauchen 3 bis 8 Schläge.' },
          { kind: 'besser', text: 'Die Schläge folgen schneller aufeinander und stauen sich, wenn du schnell klickst. Es erscheint kein Fortschrittsbalken mehr.' },
          { kind: 'besser', text: 'Türen öffnest du weiter mit Linksklick; abreißen geht mit Rechtsklick. Rechtsklick reißt Möbel und Teile weiterhin in einem Zug ab.' },
        ],
      },
    ],
  },
  {
    version: '0.3.6',
    date: '18.10.2026',
    name: 'Türen im Haus, Reihenhäuser, L-Häuser und Eckhäuser',
    groups: [
      {
        title: 'Häuser',
        items: [
          { kind: 'neu', text: 'Die Durchgänge zwischen den Zimmern im Erdgeschoss haben jetzt echte Türen: Linksklick öffnet und schließt, Zombies öffnen und schlagen sie ein, mit Axt oder Hammer reißt du sie ab.' },
          { kind: 'besser', text: 'Die Haustür führt in Wohnhäusern und Wohnblöcken immer in den Flur oder ins Wohnzimmer, nie mehr direkt in Bad, Schlafzimmer, Küche oder Lager.' },
          { kind: 'neu', text: 'Reihenhäuser: drei schmale Häuser Wand an Wand entlang der Straße, jedes mit eigener Tür.' },
          { kind: 'neu', text: 'L-Häuser: zwei Flügel um die Ecke, jeder mit Eingang zur eigenen Straße und einem Durchgang dazwischen.' },
          { kind: 'neu', text: 'Eckhäuser haben teils zwei Eingänge zu den beiden Straßen, mit eigenem Weg zum Gehweg.' },
        ],
      },
    ],
  },
  {
    version: '0.3.5',
    date: '18.10.2026',
    name: 'Neues HUD',
    groups: [
      {
        title: 'Anzeige',
        items: [
          { kind: 'besser', text: 'Überarbeitete Anzeige unten rechts: drei Ringe für Sättigung, Durst und Ausdauer, Balken für Wärme und Leben, Körperfigur mit Wunden und große Uhrzeit mit Tag.' },
        ],
      },
    ],
  },
  {
    version: '0.3.4',
    date: '18.10.2026',
    name: 'Wandabschnitte, Türen abreißen, Fensterbarrikaden',
    groups: [
      {
        title: 'Wände und Türen',
        items: [
          { kind: 'besser', text: 'Lange Wände bestehen aus Abschnitten: an Türen, dort wo andere Wände anstoßen (Zimmerende) und höchstens 3 m lang. Du schlägst immer nur einen Abschnitt ein, die Nachbarn bleiben stehen.' },
          { kind: 'neu', text: 'Haustüren lassen sich mit Axt, Brecheisen, Vorschlaghammer oder Hammer abreißen (Rechtsklick). Das Türblatt verschwindet, der Durchgang bleibt offen.' },
          { kind: 'besser', text: 'Gebaute Wände und Fensterwände sehen aus wie die Zimmerwände der Häuser: weißer Putz mit Fußleiste.' },
        ],
      },
      {
        title: 'Fensterbarrikaden',
        items: [
          { kind: 'neu', text: 'Neues Bauteil: Fensterbarrikade (3× Holz, 4× Nägel). Im Inventar Rechtsklick auf „Bauen“, dann mit der Maus auf ein Fenster zeigen und Rechtsklick: die Bretter kommen immer an die Außenseite. Die Scheibe muss vorher eingeschlagen sein.' },
          { kind: 'neu', text: 'Barrikaden vor Fenstern nimmst du mit Hammer, Axt oder Brecheisen (Rechtsklick) komplett wieder ab und bekommst Holz und Nägel zurück.' },
          { kind: 'besser', text: 'Im Inventar gibt es bei Bauteilen den Eintrag „Bauen“ im Rechtsklick-Menü.' },
        ],
      },
    ],
  },
  {
    version: '0.3.3',
    date: '18.10.2026',
    name: 'Bauen per Rechtsklick, Wände einschlagen',
    groups: [
      {
        title: 'Wände einschlagen',
        items: [
          { kind: 'neu', text: 'Zimmerwände schlägst du mit Hammer oder Vorschlaghammer ein: Rechtsklick pro Schlag. Mit jedem Schlag wächst das Loch, nach 5 bis 10 Schlägen ist die Wand weg (mit dem normalen Hammer doppelt so viele).' },
          { kind: 'neu', text: 'Das Loch macht den Weg frei, sobald es breit genug ist und bis zum Boden reicht. Zombies können durch Löcher sehen. Schutt und Bruchkanten bleiben liegen.' },
        ],
      },
      {
        title: 'Bauen',
        items: [
          { kind: 'neu', text: 'Das Baumenü (B) ist weg: Wände, Türen, Tisch, Stuhl, Regal, Kiste, Schrank, Zaun, Bett und Lagerfeuer stellst du im Herstellen-Reiter (C) her.' },
          { kind: 'neu', text: 'Hergestellte Bauteile liegen auf der Schnellleiste: Zahltaste drücken, mit Rechtsklick setzen, R dreht, Umschalt platziert frei, Esc beendet.' },
          { kind: 'neu', text: 'Auch in Obergeschossen und unter Treppen bauen. Wer über einer Kiste auf der Treppe steht, wird nicht mehr weggeschoben.' },
          { kind: 'neu', text: 'Neue Bauteile: Stuhl, Kiste, Schrank (beide mit Platz für Dinge, E öffnet) und Zaun.' },
          { kind: 'besser', text: 'Eigene Bauteile packst du mit Hammer, Axt oder Brecheisen (Rechtsklick) wieder ein und bekommst das Bauteil zurück.' },
        ],
      },
      {
        title: 'Werkzeug und Inventar',
        items: [
          { kind: 'besser', text: 'Axt, Hammer, Vorschlaghammer, Brecheisen, Machete, Messer, Rohr und Schläger liegen jetzt richtig in der Hand: Griff unten, Kopf und Schneide nach vorn.' },
          { kind: 'besser', text: 'Abreißen und Wände einschlagen zeigen keine Meldungen mehr.' },
          { kind: 'neu', text: 'Mehr Tragkraft: 30 kg dazu, auch in den Rucksäcken (50 kg im Hauptfach).' },
        ],
      },
      {
        title: 'Bedienung',
        items: [
          { kind: 'besser', text: 'Möbel, Haufen und Leichen öffnest du nur noch mit E (F geht weiter). Linksklick öffnet sie nicht mehr und schlägt stattdessen zu.' },
        ],
      },
    ],
  },
  {
    version: '0.3.2',
    date: '18.10.2026',
    name: 'Mitspieler, Regale und schönere Bäume',
    groups: [
      {
        title: 'Mehrspieler',
        items: [
          { kind: 'fix', text: 'Mitspieler haben jetzt dieselbe Figur wie du: Kleidung und Rucksack sitzen auf beiden Seiten gleich.' },
          { kind: 'neu', text: 'Jeder Spieler trägt eigene Farben für T-Shirt, Pullover, Pulli und Hose, damit man Mitspieler auseinanderhält.' },
        ],
      },
      {
        title: 'Bauen und Welt',
        items: [
          { kind: 'neu', text: 'Neues Bauteil: Regal (4× Holz, 4× Nägel) mit Brettern und ein paar Dosen und Kisten darauf.' },
          { kind: 'besser', text: 'Bäume: die klumpigen Cartoon-Bäume sind weg, überall stehen jetzt die detaillierten Bäume mit echten Ästen und Blättern. Sträucher sind lockerer und weniger kugelig.' },
        ],
      },
    ],
  },
  {
    version: '0.3.1',
    date: '18.10.2026',
    name: 'Straßen, Laternen und Mehrspieler',
    groups: [
      {
        title: 'Stadt',
        items: [
          { kind: 'besser', text: 'Straßen sind breiter (10 m) und die Gehwege auch (3 m). Zebrastreifen und Haltelinien passen dazu.' },
          { kind: 'neu', text: 'Gehwege mit Plattenfugen, Fahrbahnränder mit weißer Randlinie.' },
          { kind: 'besser', text: 'Laternen sind kleiner und detaillierter: Sockel, Zierbänder, geschwungener Arm und Glaslinse.' },
          { kind: 'besser', text: 'Laternenlicht nachts realistischer und breiter: weiche Lichtpfütze, Lichtkegel und Schein um die Lampe. Auch die Straßenseite im Süden hat jetzt leuchtende Laternen.' },
          { kind: 'besser', text: 'Bänke sind kleiner, mit Holzlatten, gusseisernen Seitenteilen und Armlehnen.' },
          { kind: 'besser', text: 'Pflanzbeete vor Eingängen sind runde Steinringe mit gewölbter Erde; Büsche sind kleiner.' },
        ],
      },
      {
        title: 'Mehrspieler und Updates',
        items: [
          { kind: 'fix', text: 'Beitreten: Der Cursor steht jetzt im Adressfeld statt im Namensfeld, und „Mehrspieler“ öffnet den Tab „Beitreten“.' },
          { kind: 'neu', text: 'Serverliste: Spiele im selben WLAN/LAN erscheinen automatisch, ein Klick genügt zum Beitreten.' },
          { kind: 'neu', text: 'Der Router-Port wird beim Hosten per UPnP automatisch freigegeben, soweit der Router das erlaubt.' },
          { kind: 'neu', text: 'Automatische Updates über GitHub.' },
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '18.10.2026',
    name: 'Bauen, Abreißen und neue Kleidung',
    groups: [
      {
        title: 'Charakter und Kleidung',
        items: [
          { kind: 'besser', text: 'Pullover, Kapuzenpulli, Winterjacke und Karojacke passen jetzt zum Körper; der Hals bleibt frei.' },
          { kind: 'neu', text: 'Neue Jacken: Lederjacke, Jeansjacke, Regenjacke und die orange Warnweste.' },
          { kind: 'besser', text: 'Rucksäcke neu gebaut: Trageriemen, Brust- und Hüftgurt liegen an Körper und Jacke an.' },
        ],
      },
      {
        title: 'Bauen und Abreißen',
        items: [
          { kind: 'neu', text: 'Wände rasten an Hauswänden und eigenen Wänden ein, auch in Gebäuden. Türöffnungen bleiben frei.' },
          { kind: 'neu', text: 'Neue Bauteile: Fensterwand, Barrikade und Tisch.' },
          { kind: 'neu', text: 'Möbel und Zimmerwände abreißen: Axt oder Brecheisen für Holz, Vorschlaghammer für Wände und Metall (Rechtsklick).' },
          { kind: 'neu', text: 'Neue Animationen für Axthieb und Vorschlaghammer mit Splittern, Staub und Kamerawackeln.' },
          { kind: 'fix', text: 'Trennwände enden nicht mehr in Türöffnungen.' },
        ],
      },
      {
        title: 'Häuser und Treppen',
        items: [
          { kind: 'fix', text: 'Hinter der Haustür steht keine Wand und kein Möbelstück mehr im Weg.' },
          { kind: 'besser', text: 'Kleine Räume sind nicht mehr vollgestellt: höchstens 3 durchsuchbare Möbel, weniger Kisten.' },
          { kind: 'besser', text: 'Tische und Schreibtische stehen geordnet in Reihen.' },
          { kind: 'besser', text: 'Neue offene Holztreppen mit Handlauf und Sprossen; über dem Treppenloch gibt es keinen Boden mehr, man sieht hinunter.' },
        ],
      },
      {
        title: 'Türen und Herstellen',
        items: [
          { kind: 'neu', text: 'Viele Türen sind abgeschlossen: mit Dietrich knacken oder mit Brecheisen, Axt, Vorschlaghammer aufbrechen.' },
          { kind: 'neu', text: 'Neue Items: Hammer, Vorschlaghammer, Nägel, Metallschrott, Dietrich.' },
          { kind: 'besser', text: 'Fenster verbarrikadieren braucht Nägel; mit Hammer geht es schneller.' },
        ],
      },
      {
        title: 'Inventar und Menü',
        items: [
          { kind: 'besser', text: 'Keine Körpertaschen mehr: Seitentaschen hat man immer (4 kg), dazu der Rucksack mit 20 kg.' },
          { kind: 'besser', text: 'Die Person-Seite zeigt keine Lastanzeige mehr.' },
          { kind: 'besser', text: 'Kleidung links und über der Figur, Schnellleiste darunter, „Bauen“ als Reiter neben „Boden“.' },
          { kind: 'neu', text: 'Neues Hauptmenü mit Neuigkeiten und diesem Änderungsverlauf.' },
        ],
      },
      {
        title: 'Mehrspieler und Hauptmenü',
        items: [
          { kind: 'neu', text: 'Hauptmenü komplett neu: Wald im Dunst, Liste links mit Vorschaubild des letzten Spielstands, Neuigkeiten, Credits, Optionen und Beenden oben rechts.' },
          { kind: 'neu', text: 'Mehrspieler funktioniert: Hosten oder per Adresse beitreten. Gleiche Welt, Mitspieler mit Namen, gemeinsame Zeit und Wetter.' },
          { kind: 'neu', text: 'Zombies laufen beim Host und sind für alle sichtbar; Treffer und Angriffe gelten für alle. Türen, Fenster, Beute, Bauten und Abriss werden abgeglichen.' },
          { kind: 'neu', text: 'Neue Lebensanzeige unten rechts: Ringe für Sättigung, Ausdauer und Wärme, Balken für Durst und Leben, Körperfigur, die Wunden zeigt.' },
          { kind: 'neu', text: 'Chat im Spiel (Enter). Fahrzeuge und Fraktions-NPCs werden noch nicht zwischen Spielern abgeglichen.' },
        ],
      },
      {
        title: 'Werkzeuge und Darstellung',
        items: [
          { kind: 'neu', text: 'Admin-Werkzeug (F9): Liste aller Gegenstände, per Klick ins Inventar legen; Heilen und Bedürfnisse auffüllen.' },
          { kind: 'besser', text: 'Möbel werfen jetzt Schatten und wirken dadurch plastischer.' },
          { kind: 'besser', text: 'Keine gelben Symbole mehr über Schränken und Kisten mit Inhalt.' },
          { kind: 'fix', text: 'Fehlende Icons für Axt, Baseballschläger, Eisenrohr und Messer ergänzt.' },
        ],
      },
      {
        title: 'Zombies',
        items: [
          { kind: 'neu', text: 'Zombies finden jetzt ihren Weg durch Räume, um Möbel und um Häuser herum, statt gegen die erste Wand zu laufen.' },
          { kind: 'besser', text: 'Zombies schlagen nicht mehr durch die Decke: sie greifen nur auf ihrer Etage an.' },
          { kind: 'besser', text: 'Zombies können keine Türen öffnen. Türen und Fenster schlagen sie ein, und das dauert deutlich länger.' },
        ],
      },
      {
        title: 'Leistung',
        items: [{ kind: 'besser', text: 'Zombies außerhalb der Sicht werden nicht mehr animiert.' }],
      },
    ],
  },
  {
    version: '0.2.0',
    date: 'früher',
    name: 'Überlebens-Simulation',
    groups: [
      {
        title: 'Grundlagen',
        items: [
          { kind: 'neu', text: 'Stadt mit Gebäuden und Innenräumen, Fahrzeuge, Zombies und Fraktionen.' },
          { kind: 'neu', text: 'Verletzungen, Sichtfeld, Wetter, Tag und Nacht, Speichern und Laden.' },
        ],
      },
    ],
  },
];

export const VERSION = CHANGELOG[0].version;

export const KIND_LABEL: Record<ChangeKind, string> = { neu: 'Neu', besser: 'Besser', fix: 'Behoben' };
