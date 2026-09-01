# 🧾 Pay

Mobile-first web-app voor vaste lasten en onderlinge verrekeningen. Wat er
loopt, van welke rekening het afgaat, wie het uiteindelijk draagt — en wie wie
wat schuldig is, ná wegstrepen.

Zelfde opzet als [CATANIA](https://github.com/Brokkert/catan),
[Paklijst](https://github.com/Brokkert/list) en
[Camp](https://github.com/Brokkert/camp) — Vite + React, één HTML-bestand, een
gratis Supabase-project erachter en gratis hosting op GitHub Pages.

De vormgeving doet bijna niets, en dat is de bedoeling: één accentkleur en
verder grijstinten, met rood en groen uitsluitend voor richting — in het krijt
of tegoed. Als álles kleur heeft betekent kleur niets meer. Bedragen staan in
cijfers van gelijke breedte en rechts uitgelijnd, zodat een rij getallen een
kolom wordt die je kunt scannen. Geen emoji, geen webfonts, geen plaatjes.

---

## Het idee

In een spreadsheet lopen drie dingen door elkaar heen, en die drie zijn precies
waar het misgaat:

1. wat er van de **gezamenlijke rekening** afgaat en wat je vriendin daarvoor
   moet storten;
2. dingen die jij van je **eigen of zakelijke rekening** betaalt en waar je geld
   voor terugkrijgt — van haar, of van vrienden in een gedeeld abonnement;
3. abonnementen van **iemand anders** waar jij aan meebetaalt.

Pay behandelt die drie als één ding. **Elke post heeft één betaler en één
verdeling.** Wie een deel draagt maar niet de betaler is, staat bij die betaler
in het krijt. Meer is er niet.

De gezamenlijke rekening telt daarbij als een eigen partij in de boeken. "Wat
moet zij overmaken" is dus geen apart soort som, maar gewoon haar schuld aan die
partij — dezelfde berekening als de rest.

Daardoor verrekent alles kruislings vanzelf. Zit Pieter in jouw YouTube Family
(€ 6,50 per maand) en zit jij in zijn Spotify Duo (€ 7,50), dan rolt daar netto
**€ 1,00 van jou naar Pieter** uit. Je hoeft nergens iets af te trekken; er staat
één regel.

## Wat er in zit

- **🧾 Overzicht** — wat er deze maand loopt, wat jij daarvan draagt, en de
  bedragen die je als vaste overboeking klaar kunt zetten. Plus waar het heen
  gaat per categorie, wat er van welke rekening afgaat, en wat ieder uiteindelijk
  draagt.
- **🔁 Lasten** — alle posten, doorzoekbaar en te filteren op wat nu loopt, wat
  gedeeld is, wat zakelijk is en wat je hebt opgezegd. Per post het maandbedrag
  én het jaarbedrag, want een abonnement van € 8,99 is € 107,88 per jaar.
- **🤝 Verrekenen** — per persoon het nettobedrag, met de onderbouwing erachter:
  elke post die tussen jullie tweeën meespeelt. Een verrekening die je niet kunt
  navertellen ga je niet vertrouwen.
- **👥 Mensen** — personen en rekeningen. Niet iedere persoon hoeft een account
  te hebben: de vriend met wie je een abonnement deelt staat er gewoon in.
- **📋 Plakken uit Excel** — sleep twee kolommen uit je bestaande overzicht
  hierheen; tabs, puntkomma's, euro-tekens en kopregels worden herkend.
- **⬇️ Exporteren** — een CSV die rechtstreeks in Excel opent, met per post het
  maandbedrag, het jaarbedrag en het aandeel van iedereen in een eigen kolom.

## Vier manieren om te verdelen

| | Waarvoor |
|---|---|
| **Gelijk** | Ieder evenveel. |
| **In delen** | 2 om 1, of naar aantal plekken in een Family-abonnement. |
| **In procenten** | 60/40 naar inkomen. |
| **Vaste bedragen** | Je tikt per persoon het bedrag in. |

Onder de keuze staat meteen wat het in euro's betekent. Een percentage zegt
niets; "Partner € 801,75 per maand" wel.

## Geen halve centen

Alle bedragen staan als een geheel aantal centen in de database. Een verdeling
die niet opgaat wordt met de **methode van de grootste rest** verdeeld: € 25,99
over vier wordt 6,50 / 6,50 / 6,50 / 6,49 — samen precies € 25,99, elke keer
dezelfde uitkomst. Een boekhouding die per keer wisselt is onbruikbaar, dus dat
wordt getest: `npm test` prikt bij elk bedrag van 0 tot 500 cent in de verdeling
en laat de build vallen zodra de som niet klopt.

De omrekening van jaar naar maand rondt één keer af, aan het begin. Een
verzekering van € 186 per jaar staat als € 15,50 per maand in de boeken, en dat
getal wordt daarna niet meer aangeraakt.

## Waar het staat

Pay draait in twee standen.

**Lokale kluis** — zonder Supabase-project werkt alles meteen: alles staat in
deze browser en gaat nergens heen. Prima om het eerst een maand te proberen.

**Samen** — met een eigen gratis Supabase-project erachter staat alles in de
database, afgeschermd per **huishouden** met Row Level Security. Je vriendin logt
in met haar eigen adres en ziet dezelfde posten en verrekeningen. Aanmelden kan
alleen met een uitnodigingslink die jij maakt, en van die codes bewaart de
database alleen een SHA-256-hash. Setup staat in
[SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Wat je lokaal hebt opgebouwd til je na het inloggen in één klik over.

## Wat er wel en niet openbaar is

De repo is publiek — dat moet, want GitHub Pages is alleen gratis bij een
publieke repo. **Er staan geen gegevens in.** Wat er in staat is code, en de
publishable key van Supabase, die openbaar hoort te zijn en in zijn eentje
nergens toegang toe geeft.

Je eigen bedragen staan in je Supabase-project, achter Row Level Security per
huishouden. Concreet:

- Wie niet is ingelogd (`anon`) komt bij geen enkele tabel. Niet "ziet nul
  rijen" — komt er niet bij.
- Wie wel is ingelogd ziet uitsluitend het huishouden waar hij lid van is, en
  kan er ook alleen in schrijven.
- Aanmelden kan alleen met een geldige uitnodiging, afgedwongen door een trigger
  op `auth.users` — dus ook als iemand het formulier overslaat en de
  auth-endpoint rechtstreeks aanroept.
- Van uitnodigingscodes staat alleen een SHA-256-hash in de database, en de code
  zelf staat achter het hekje in de link, waar hij nooit naar een server gaat.
- De pagina staat op `noindex` en stuurt geen verwijzer mee.

Dat zijn geen beloftes maar tests: `./supabase/run-tests.sh` draait het schema
tegen een echte PostgreSQL en laat de build vallen zodra een van deze punten
niet meer klopt.

Twee dingen om zelf te weten:

- **Supabase kan je gegevens in principe lezen** (het is hun database). Wil je
  dat ook uitsluiten, dan is er end-to-end versleuteling nodig; dat kost je
  "wachtwoord vergeten" en vraagt om het delen van een sleutel.
- **De lokale kopie in je browser is niet versleuteld.** Pay bewaart er een kopie
  in zodat de app zonder bereik nog iets kan laten zien. Bij uitloggen wordt die
  gewist; op een computer die niet van jou is, log dus ook echt uit.

## Ontwikkelen

```bash
npm install
npm run dev      # dev server
npm test         # vitest
npm run build    # productie build → dist/index.html (één bestand)
node smoke.mjs   # klikt de app door in een echte browser
```

Het beveiligingsmodel is te testen zonder je echte project aan te raken. Met een
lokale PostgreSQL:

```bash
./supabase/run-tests.sh
```

Dat zet een wegwerpdatabase op, draait `schema.sql` erover en controleert onder
meer dat een tweede huishouden je posten niet ziet, dat aanmelden zonder geldige
uitnodiging geweigerd wordt — ook buiten het formulier om — en dat je jezelf wel
aan een persoon kunt koppelen en iemand anders niet. Dezelfde controle draait bij
elke push in GitHub Actions.

## Deployen

Elke push naar `main` bouwt en deployt automatisch naar **GitHub Pages** via
`.github/workflows/deploy.yml`. Let op: GitHub Pages op een gratis account
vereist een **publieke** repo. De publishable key hoort daar thuis en is bedoeld
om openbaar te zijn — hij geeft in zijn eentje nergens toegang toe, dat regelt
Row Level Security.
