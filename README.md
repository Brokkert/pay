# 🧾 Pay

Mobile-first web-app voor vaste lasten en onderlinge verrekeningen. Wat er
loopt, van welke rekening het afgaat, wie het uiteindelijk draagt — en wie wie
wat schuldig is, ná wegstrepen.

Zelfde opzet als [CATANIA](https://github.com/Brokkert/catan),
[Paklijst](https://github.com/Brokkert/list) en
[Camp](https://github.com/Brokkert/camp) — Vite + React, een gratis
Supabase-project erachter, gratis hosting op GitHub Pages — maar met een eigen
gezicht: **kasboek**. Kolommenpapier met groene inkt, liniatuur als watermerk,
en alle bedragen in mono met cijfers van gelijke breedte, zodat de komma's onder
elkaar staan. Onder een totaal de dubbele lijn van een grootboek. Rood is
gereserveerd voor één ding: hier sta je in het krijt.

Geen webfonts. Het is één HTML-bestand van een paar honderd kilobyte en dat
opent overal.

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
